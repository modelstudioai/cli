import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { TrackingEvent } from "../src/telemetry/event.ts";
import { enterIsolatedHome, type IsolatedHomeHandle } from "./helpers/isolation.ts";

const fixture = vi.hoisted(() => ({
  signals: [] as Array<AbortSignal | undefined>,
  complete: false,
  configs: [] as Array<Record<string, unknown>>,
}));
vi.mock("../lib/remote-telemetry/tracker.cjs", () => ({
  default: class {
    constructor(config: Record<string, unknown>) {
      fixture.configs.push(config);
    }
    send(_payload: string, options: { signal?: AbortSignal } = {}) {
      fixture.signals.push(options.signal);
      if (fixture.complete) return Promise.resolve();
      return new Promise<void>((resolve) =>
        options.signal?.addEventListener("abort", () => resolve(), { once: true }),
      );
    }
    use() {
      return () => {
        void this.send("event");
      };
    }
    _sendAll() {}
  },
}));

let iso: IsolatedHomeHandle;

beforeEach(() => {
  iso = enterIsolatedHome();
});

afterEach(() => {
  iso.restore();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.doUnmock("../src/config/paths.ts");
  vi.resetModules();
  fixture.signals = [];
  fixture.complete = false;
  fixture.configs = [];
});

test("flush cancels in-flight work when its shorter shutdown budget expires", async () => {
  vi.useFakeTimers();
  const { remoteSink, flushTelemetry } = await import("../src/telemetry/sink.ts");
  await remoteSink({ command: "fixture" } as TrackingEvent);
  const pending = flushTelemetry(50);
  await vi.advanceTimersByTimeAsync(49);
  expect(fixture.signals).toHaveLength(1);
  expect(fixture.signals[0]?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(fixture.signals[0]?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("send has a bounded lifetime even when a host does not flush", async () => {
  vi.useFakeTimers();
  const { remoteSink } = await import("../src/telemetry/sink.ts");
  await remoteSink({ command: "fixture" } as TrackingEvent);
  await vi.advanceTimersByTimeAsync(999);
  expect(fixture.signals[0]?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(fixture.signals[0]?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("successful sending and repeated flushes leave no deadlines behind", async () => {
  vi.useFakeTimers();
  fixture.complete = true;
  const { remoteSink, flushTelemetry } = await import("../src/telemetry/sink.ts");
  await remoteSink({ command: "fixture" } as TrackingEvent);
  await flushTelemetry(50);
  await flushTelemetry(50);
  expect(fixture.signals[0]?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("first remoteSink constructs the tracker once with persisted uid, not device_id", async () => {
  const { remoteSink } = await import("../src/telemetry/sink.ts");
  expect(fixture.configs).toHaveLength(0);
  await remoteSink({ command: "fixture" } as TrackingEvent);
  await remoteSink({ command: "fixture" } as TrackingEvent);
  expect(fixture.configs).toHaveLength(1);
  const { loadUid } = await import("../src/telemetry/uid.ts");
  expect(fixture.configs[0]).toMatchObject({
    pid: "bailian-cli-node",
    uid: loadUid(),
  });
  expect(fixture.configs[0]).not.toHaveProperty("device_id");
});

test("importing sink without reporting does not create the uid file", async () => {
  await import("../src/telemetry/sink.ts");
  const { getUidPath } = await import("../src/telemetry/uid.ts");
  expect(existsSync(getUidPath())).toBe(false);
});

test("flush waits for in-flight local writes even when no remote send is pending", async () => {
  const { localSink, flushTelemetry } = await import("../src/telemetry/sink.ts");
  // Fire-and-forget as trackCommandExecution does; flush must still persist the line.
  void localSink({ command: "local-only" } as TrackingEvent);
  await flushTelemetry(1000);
  const path = join(iso.configDir, "telemetry.jsonl");
  expect(existsSync(path)).toBe(true);
  expect(readFileSync(path, "utf8")).toContain('"command":"local-only"');
});

test("flush returns within its budget when a local write stalls", async () => {
  vi.useFakeTimers();
  vi.doMock("../src/config/paths.ts", async () => {
    const actual =
      await vi.importActual<typeof import("../src/config/paths.ts")>("../src/config/paths.ts");
    return {
      ...actual,
      ensureConfigDir: () => new Promise<void>(() => {}),
    };
  });
  const { localSink, flushTelemetry } = await import("../src/telemetry/sink.ts");
  void localSink({ command: "stalled-local" } as TrackingEvent);
  const pending = flushTelemetry(50);
  await vi.advanceTimersByTimeAsync(49);
  // Still within budget: flush must not have resolved by hanging on local I/O alone.
  let settled = false;
  void pending.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(settled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
