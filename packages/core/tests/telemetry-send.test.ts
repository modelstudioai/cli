import { createRequire } from "node:module";
import dns from "node:dns";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vite-plus/test";
import Tracker from "../lib/remote-telemetry/tracker.cjs";

const require = createRequire(import.meta.url);
const transport = require("undici") as typeof import("undici");
let fetchSpy: MockInstance<typeof transport.fetch>;
let resolveSpy: MockInstance<typeof dns.resolve>;

beforeEach(() => {
  fetchSpy = vi
    .spyOn(transport, "fetch")
    .mockResolvedValue(new Response(null, { status: 204 }) as never);
  resolveSpy = vi.spyOn(dns, "resolve").mockImplementation((...args: unknown[]) => {
    (args.at(-1) as (error: null, addresses: string[]) => void)(null, ["127.0.0.1"]);
  });
});
afterEach(() => vi.restoreAllMocks());

test("telemetry uses the bounded transport without a separate DNS preflight", async () => {
  const controller = new AbortController();
  const tracker = new Tracker({ pid: "fixture-pid", env: "dev" });
  await tracker.send("fixture event", { signal: controller.signal });
  expect(resolveSpy).not.toHaveBeenCalled();
  expect(fetchSpy).toHaveBeenCalledOnce();
  expect(fetchSpy.mock.calls[0]).toEqual([
    "https://gm.mmstat.com/aes.1.1",
    expect.objectContaining({
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ gokey: "fixture%20event", gmkey: "EXP" }),
    }),
  ]);
});

test("telemetry releases the unused response body before completing", async () => {
  const cancel = vi.fn();
  fetchSpy.mockResolvedValue(new Response(new ReadableStream({ cancel })) as never);
  await new Tracker({ pid: "fixture-pid" }).send("event", { signal: new AbortController().signal });
  expect(cancel).toHaveBeenCalledOnce();
});

test("an aborted send neither opens a request nor replays queued events", async () => {
  const tracker = new Tracker({ pid: "fixture-pid" });
  const queued = tracker as unknown as { _offlineQueue: string[] };
  queued._offlineQueue.push("queued");
  const controller = new AbortController();
  controller.abort();
  await tracker.send("event", { signal: controller.signal });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(queued._offlineQueue).toEqual(["queued"]);
});

test("queued retries share the current cancellation signal and retain event encoding", async () => {
  const tracker = new Tracker({ pid: "fixture-pid" });
  (tracker as unknown as { _offlineQueue: string[] })._offlineQueue.push("old event");
  const controller = new AbortController();
  await tracker.send("new event", { signal: controller.signal });
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(fetchSpy.mock.calls.map(([, options]) => options?.signal)).toEqual([
    controller.signal,
    controller.signal,
  ]);
  expect(fetchSpy.mock.calls.map(([, options]) => JSON.parse(options?.body as string))).toEqual([
    { gokey: "old%20event", gmkey: "EXP" },
    { gokey: "new%20event", gmkey: "EXP" },
  ]);
});

test("cancellation failures are silent and are not queued for retry", async () => {
  const tracker = new Tracker({ pid: "fixture-pid" });
  const controller = new AbortController();
  fetchSpy.mockImplementation(async () => {
    controller.abort();
    throw new DOMException("cancelled", "AbortError");
  });
  await expect(tracker.send("event", { signal: controller.signal })).resolves.toBeUndefined();
  expect((tracker as unknown as { _offlineQueue: string[] })._offlineQueue).toEqual([]);
});

test("response cleanup failures do not replay an already acknowledged event", async () => {
  const tracker = new Tracker({ pid: "fixture-pid" });
  fetchSpy.mockResolvedValue(
    new Response(
      new ReadableStream({
        cancel() {
          return Promise.reject(new Error("cleanup failed"));
        },
      }),
    ) as never,
  );
  await expect(
    tracker.send("event", { signal: new AbortController().signal }),
  ).resolves.toBeUndefined();
  expect((tracker as unknown as { _offlineQueue: string[] })._offlineQueue).toEqual([]);
});

test.each([false, true])(
  "Node telemetry owns its dispatcher without replacing the global one (proxy=%s)",
  async (proxy) => {
    vi.stubEnv("HTTP_PROXY", proxy ? "http://127.0.0.1:9" : "");
    vi.stubEnv("HTTPS_PROXY", proxy ? "http://127.0.0.1:9" : "");
    const globalDispatcher = transport.getGlobalDispatcher();
    const destroy = vi.spyOn(globalDispatcher, "destroy");
    try {
      await new Tracker({ pid: "fixture-pid" }).send("event", {
        signal: new AbortController().signal,
      });
      const dispatcher = fetchSpy.mock.calls[0]?.[1]?.dispatcher;
      expect(dispatcher).toBeInstanceOf(proxy ? transport.EnvHttpProxyAgent : transport.Agent);
      expect(dispatcher).not.toBe(globalDispatcher);
      expect(transport.getGlobalDispatcher()).toBe(globalDispatcher);
      expect(destroy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  },
);
