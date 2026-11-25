import { afterEach, expect, test, vi } from "vite-plus/test";
import { flushOutput, INTERRUPT_FLUSH_TIMEOUT_MS, trackStreamWrites } from "../src/output/flush.ts";

type WriteCallback = (error?: Error | null) => void;

function createDeferredWriteStream(options?: { neverComplete?: boolean }) {
  const callbacks: WriteCallback[] = [];
  const stream = {
    write(
      _chunk: unknown,
      encodingOrCallback?: BufferEncoding | WriteCallback,
      maybeCallback?: WriteCallback,
    ) {
      const callback =
        typeof encodingOrCallback === "function" ? encodingOrCallback : maybeCallback;
      if (callback && !options?.neverComplete) callbacks.push(callback);
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  trackStreamWrites(stream);
  return {
    stream,
    completeNext(error?: Error | null) {
      const callback = callbacks.shift();
      if (!callback) throw new Error("No pending write callback");
      callback(error);
    },
    pendingCount: () => callbacks.length,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

test("flushOutput waits for tracked write callbacks", async () => {
  const writable = createDeferredWriteStream();
  writable.stream.write("hello");
  expect(writable.pendingCount()).toBe(1);

  let flushed = false;
  let timedOut: boolean | undefined;
  const pending = flushOutput(5_000).then((result) => {
    timedOut = result;
    flushed = true;
  });
  await Promise.resolve();
  expect(flushed).toBe(false);

  writable.completeNext();
  await pending;
  expect(flushed).toBe(true);
  expect(timedOut).toBe(false);
});

test("flushOutput returns true when a callback never fires", async () => {
  vi.useFakeTimers();
  const writable = createDeferredWriteStream({ neverComplete: true });
  writable.stream.write("stuck");

  const pending = flushOutput(50);
  await vi.advanceTimersByTimeAsync(50);
  expect(await pending).toBe(true);
});

test("flushOutput settles when a write callback reports an error", async () => {
  const writable = createDeferredWriteStream();
  writable.stream.write("broken");
  const pending = flushOutput(5_000);
  writable.completeNext(new Error("EPIPE"));
  expect(await pending).toBe(false);
});

test("trackStreamWrites is idempotent on the same stream", async () => {
  const writable = createDeferredWriteStream();
  trackStreamWrites(writable.stream);
  writable.stream.write("once");
  expect(writable.pendingCount()).toBe(1);
  const pending = flushOutput(5_000);
  writable.completeNext();
  expect(await pending).toBe(false);
});

test("trackStreamWrites settles pending when write throws synchronously", async () => {
  const stream = {
    write() {
      throw new Error("sync write failure");
    },
  } as unknown as NodeJS.WriteStream;
  trackStreamWrites(stream);
  expect(() => stream.write("x")).toThrow("sync write failure");
  const startedAt = Date.now();
  expect(await flushOutput(5_000)).toBe(false);
  expect(Date.now() - startedAt).toBeLessThan(1_000);
});

test("interrupt flush timeout is much shorter than the default", () => {
  expect(INTERRUPT_FLUSH_TIMEOUT_MS).toBeLessThan(5_000);
  expect(INTERRUPT_FLUSH_TIMEOUT_MS).toBeGreaterThan(0);
});
