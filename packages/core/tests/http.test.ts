import { getEventListeners } from "node:events";
import { createServer, type RequestListener } from "node:http";
import type { Socket } from "node:net";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { Client } from "../src/client/client.ts";
import { request, requestJson, type HttpDeps } from "../src/client/http.ts";
import { BailianError } from "../src/errors/base.ts";
import { ExitCode } from "../src/errors/codes.ts";

function testDeps(timeout = 5): HttpDeps {
  return {
    identity: {
      binName: "test-cli",
      version: "0.0.0-test",
      npmPackage: "test-cli",
      clientName: "test-client",
    },
    settings: {
      output: "json",
      outputExplicit: true,
      timeout,
      watermark: true,
      verbose: false,
      quiet: true,
      dryRun: false,
      telemetry: false,
    },
  };
}

function testClient(baseUrl: string, deps = testDeps()): Client {
  return new Client({
    ...deps,
    baseUrl,
    apiCred: { token: "local-test-only", baseUrl, source: "flag" },
  });
}

async function withServer(
  handler: RequestListener,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const sockets = new Set<Socket>();
  const server = createServer(handler);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  // Bound failures even if a regression leaves a body read hanging indefinitely.
  const watchdog = setTimeout(() => server.closeAllConnections(), 3_000);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local TCP server");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    clearTimeout(watchdog);
    const closed = new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    for (const socket of sockets) socket.destroy();
    await closed;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("real HTTP response bodies", () => {
  test.each([
    { caller: "requestJson", status: 200 },
    { caller: "requestJson", status: 503 },
    { caller: "Client.requestJson", status: 200 },
    { caller: "request", status: 503 },
  ])("$caller times out while reading a partial $status JSON body", async ({ caller, status }) => {
    const readBody = vi.spyOn(Response.prototype, "json");
    await withServer(
      (_incoming, response) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.flushHeaders();
        response.write('{"message":"unfinished');
      },
      async (url) => {
        const startedAt = performance.now();
        const pending =
          caller === "Client.requestJson"
            ? testClient(url, testDeps(0.15)).requestJson({ path: "/" })
            : caller === "request"
              ? request(testDeps(), { url, timeout: 0.15 })
              : requestJson(testDeps(), { url, timeout: 0.15 });
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(readBody).toHaveBeenCalledOnce();
        expect(performance.now() - startedAt).toBeLessThan(2_000);
      },
    );
  });

  test.each([200, 503])(
    "Client preserves the exact parent reason when aborted after %i headers",
    async (status) => {
      const parent = new AbortController();
      const reason = new BailianError("Caller wait budget exhausted", ExitCode.TIMEOUT);
      const originalJson = Response.prototype.json;
      let bodyStarted!: () => void;
      const readingBody = new Promise<void>((resolve) => {
        bodyStarted = resolve;
      });
      vi.spyOn(Response.prototype, "json").mockImplementationOnce(function (this: Response) {
        bodyStarted();
        return originalJson.call(this);
      });
      await withServer(
        (_incoming, response) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.flushHeaders();
          response.write('{"message":"unfinished');
        },
        async (url) => {
          const pending = testClient(url).requestJson({ path: "/", signal: parent.signal });
          const rejected = expect(pending).rejects.toBe(reason);
          await readingBody;
          expect(getEventListeners(parent.signal, "abort")).toHaveLength(1);
          parent.abort(reason);
          await rejected;
          expect(getEventListeners(parent.signal, "abort")).toHaveLength(0);
        },
      );
    },
  );

  test.each([undefined, "200", "Success"])("accepts normal JSON with code %s", async (code) => {
    const body = { code, output: { text: "正常 JSON" } };
    await withServer(
      (_incoming, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      },
      async (url) => {
        await expect(testClient(url).requestJson({ path: "/" })).resolves.toEqual(body);
      },
    );
  });

  test.each([
    {
      label: "top-level service code",
      status: 200,
      contentType: "application/json",
      body: '{"code":"ServiceBusy","message":"服务端原文 / original service message"}',
      message: "服务端原文 / original service message",
      api: { httpStatus: 200, apiCode: "ServiceBusy" },
    },
    {
      label: "HTTP service error",
      status: 503,
      contentType: "application/json",
      body: '{"error":{"type":"Unavailable","message":"服务端原文 / original service message"},"request_id":"local-request"}',
      message: "服务端原文 / original service message",
      api: { httpStatus: 503, apiCode: "Unavailable", requestId: "local-request" },
    },
    {
      label: "non-JSON success response",
      status: 200,
      contentType: "text/html",
      body: "<html>not JSON</html>",
      message: expect.stringContaining("API returned non-JSON response (text/html)"),
      api: undefined,
    },
    {
      label: "non-JSON HTTP error",
      status: 503,
      contentType: "text/html",
      body: "<html>unavailable</html>",
      message: "HTTP 503",
      api: { httpStatus: 503 },
    },
  ])("keeps $label behavior", async ({ status, contentType, body, message, api }) => {
    await withServer(
      (_incoming, response) => {
        response.writeHead(status, { "content-type": contentType });
        response.end(body);
      },
      async (url) => {
        await expect(requestJson(testDeps(), { url })).rejects.toMatchObject({
          name: "BailianError",
          exitCode: ExitCode.GENERAL,
          message,
          api,
        });
      },
    );
  });
});

describe("request signal cleanup", () => {
  test.each([
    { label: "success", status: 200, body: '{"ok":true}', fails: false },
    { label: "HTTP error", status: 503, body: '{"message":"service error"}', fails: true },
    { label: "service code", status: 200, body: '{"code":"ServiceError"}', fails: true },
    { label: "non-JSON", status: 200, body: "not JSON", fails: true },
  ])(
    "keeps one timer and parent listener through the body, then cleans up on $label",
    async ({ status, body, fails }) => {
      vi.useFakeTimers();
      const parent = new AbortController();
      let finishBody!: () => void;
      const response = new Response(body, { status });
      const originalJson = response.json.bind(response);
      let bodyStarted!: () => void;
      const readingBody = new Promise<void>((resolve) => {
        bodyStarted = resolve;
      });
      vi.spyOn(response, "json").mockImplementation(async () => {
        bodyStarted();
        await new Promise<void>((resolve) => {
          finishBody = resolve;
        });
        return originalJson();
      });
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
      const pending = requestJson(testDeps(), {
        url: "http://127.0.0.1/unused",
        signal: parent.signal,
      });
      await readingBody;
      const signal = fetchMock.mock.calls[0][1]!.signal!;
      expect(vi.getTimerCount()).toBe(1);
      expect(getEventListeners(parent.signal, "abort")).toHaveLength(1);
      finishBody();
      if (fails) await expect(pending).rejects.toBeInstanceOf(BailianError);
      else await expect(pending).resolves.toEqual({ ok: true });
      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(parent.signal, "abort")).toHaveLength(0);
      expect(getEventListeners(signal, "abort")).toHaveLength(0);
      parent.abort(new Error("Too late"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(signal.aborted).toBe(false);
    },
  );

  test.each([false, true])("cleans up a fetch failure (already aborted: %s)", async (aborted) => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const reason = { budget: "exhausted" };
    if (aborted) parent.abort(reason);
    const failure = new TypeError("fetch failed");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);
    await expect(
      requestJson(testDeps(), { url: "http://127.0.0.1/unused", signal: parent.signal }),
    ).rejects.toBe(aborted ? reason : failure);
    const signal = fetchMock.mock.calls[0][1]!.signal!;
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(parent.signal, "abort")).toHaveLength(0);
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
  });

  test.each(["timeout", "parent"])(
    "cleans up during %s while preserving the signal reason",
    async (source) => {
      vi.useFakeTimers();
      const parent = new AbortController();
      const reason = new Error("Parent budget exhausted");
      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
        const signal = init!.signal!;
        const response = new Response("{}");
        vi.spyOn(response, "json").mockImplementation(
          () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => reject(new DOMException("Body aborted", "AbortError")),
                { once: true },
              );
            }),
        );
        return response;
      });
      const pending = requestJson(testDeps(), {
        url: "http://127.0.0.1/unused",
        signal: parent.signal,
      });
      const signal = fetchMock.mock.calls[0][1]!.signal!;
      const rejected = expect(pending).rejects.toSatisfy(
        (error: unknown) => error === signal.reason,
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      if (source === "parent") parent.abort(reason);
      else await vi.advanceTimersByTimeAsync(5_000);
      await rejected;
      if (source === "parent") expect(signal.reason).toBe(reason);
      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(parent.signal, "abort")).toHaveLength(0);
      expect(getEventListeners(signal, "abort")).toHaveLength(0);
    },
  );

  test("raw success returns the identical unconsumed Response and detaches at headers", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const response = new Response('{"stream":"still readable"}');
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const result = await request(testDeps(), {
      url: "http://127.0.0.1/unused",
      signal: parent.signal,
      stream: true,
    });
    const signal = fetchMock.mock.calls[0][1]!.signal!;
    expect(result).toBe(response);
    expect(result.bodyUsed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(parent.signal, "abort")).toHaveLength(0);
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
    parent.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signal.aborted).toBe(false);
    await expect(result.json()).resolves.toEqual({ stream: "still readable" });
  });
});
