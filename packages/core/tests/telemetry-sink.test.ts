import { afterEach, expect, test, vi } from "vite-plus/test";
import type { TrackingEvent } from "../src/telemetry/event.ts";

const fixture = vi.hoisted(() => ({
  signals: [] as Array<AbortSignal | undefined>,
  complete: false,
}));
vi.mock("../lib/remote-telemetry/tracker.cjs", () => ({
  default: class {
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

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.resetModules();
  fixture.signals = [];
  fixture.complete = false;
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
