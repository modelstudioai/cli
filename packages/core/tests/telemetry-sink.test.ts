import { existsSync } from "node:fs";
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

function fixtureEvent(site: "domestic" | "international" = "domestic"): TrackingEvent {
  return { command: "fixture", site } as TrackingEvent;
}

let iso: IsolatedHomeHandle;

beforeEach(() => {
  iso = enterIsolatedHome();
});

afterEach(() => {
  iso.restore();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.resetModules();
  fixture.signals = [];
  fixture.complete = false;
  fixture.configs = [];
});

test("flush cancels in-flight work when its shorter shutdown budget expires", async () => {
  vi.useFakeTimers();
  const { remoteSink, flushTelemetry } = await import("../src/telemetry/sink.ts");
  await remoteSink(fixtureEvent());
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
  await remoteSink(fixtureEvent());
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
  await remoteSink(fixtureEvent());
  await flushTelemetry(50);
  await flushTelemetry(50);
  expect(fixture.signals[0]?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("first remoteSink constructs the tracker once with persisted uid, not device_id", async () => {
  const { remoteSink } = await import("../src/telemetry/sink.ts");
  expect(fixture.configs).toHaveLength(0);
  await remoteSink(fixtureEvent());
  await remoteSink(fixtureEvent());
  expect(fixture.configs).toHaveLength(1);
  const { loadUid } = await import("../src/telemetry/uid.ts");
  expect(fixture.configs[0]).toMatchObject({
    pid: "bailian-cli-node",
    endpoint: "gm.mmstat.com",
    uid: loadUid(),
  });
  expect(fixture.configs[0]).not.toHaveProperty("device_id");
});

test("keyed-by-site Map builds separate trackers for domestic and international", async () => {
  fixture.complete = true;
  const { remoteSink, flushTelemetry, resetRemoteTelemetryForTests } =
    await import("../src/telemetry/sink.ts");
  await remoteSink(fixtureEvent("domestic"));
  await remoteSink(fixtureEvent("international"));
  await remoteSink(fixtureEvent("international"));
  expect(fixture.configs).toHaveLength(2);
  expect(fixture.configs[0]).toMatchObject({
    pid: "bailian-cli-node",
    endpoint: "gm.mmstat.com",
  });
  expect(fixture.configs[1]).toMatchObject({
    pid: "bailian-cli-node-intl",
    endpoint: "sg.mmstat.com",
  });
  const { loadUid } = await import("../src/telemetry/uid.ts");
  expect(fixture.configs[0]?.uid).toBe(loadUid());
  expect(fixture.configs[1]?.uid).toBe(loadUid());
  await flushTelemetry(50);
  resetRemoteTelemetryForTests();
  await remoteSink(fixtureEvent("domestic"));
  expect(fixture.configs).toHaveLength(3);
});

test("importing sink without reporting does not create the uid file", async () => {
  await import("../src/telemetry/sink.ts");
  const { getUidPath } = await import("../src/telemetry/uid.ts");
  expect(existsSync(getUidPath())).toBe(false);
});
