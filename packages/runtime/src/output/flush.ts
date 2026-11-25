/**
 * Track every stdout/stderr write so the process can exit only after the data
 * reached the OS. Bun does not order an empty write's callback after earlier
 * writes and does not report writableLength, so the callback of each real write
 * is the only reliable completion signal on both Node and Bun.
 */

import { writeSync } from "node:fs";

const pending = new Set<Promise<void>>();
const tracked = new WeakSet<NodeJS.WriteStream>();

/** Default wait for success / error-render paths. */
export const DEFAULT_FLUSH_TIMEOUT_MS = 5000;

/** Short wait for Ctrl-C so a stuck write cannot feel like a hang. */
export const INTERRUPT_FLUSH_TIMEOUT_MS = 500;

type WriteCallback = (error?: Error | null) => void;

export function trackStreamWrites(stream: NodeJS.WriteStream): void {
  if (tracked.has(stream)) return;
  tracked.add(stream);
  const original = stream.write.bind(stream) as {
    (chunk: unknown, callback?: WriteCallback): boolean;
    (chunk: unknown, encoding: BufferEncoding, callback?: WriteCallback): boolean;
  };
  stream.write = ((
    chunk: unknown,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    maybeCallback?: WriteCallback,
  ) => {
    const callback = typeof encodingOrCallback === "function" ? encodingOrCallback : maybeCallback;
    const encoding = typeof encodingOrCallback === "function" ? undefined : encodingOrCallback;
    let settle!: () => void;
    const done = new Promise<void>((resolve) => {
      settle = resolve;
    });
    pending.add(done);
    void done.then(() => pending.delete(done));
    const onComplete: WriteCallback = (error) => {
      // Settle on error too: an EPIPE must not keep the process alive.
      settle();
      callback?.(error);
    };
    try {
      if (encoding !== undefined) return original(chunk, encoding, onComplete);
      return original(chunk, onComplete);
    } catch (error) {
      settle();
      throw error;
    }
  }) as typeof stream.write;
}

/**
 * Wait until every tracked write has completed, or `timeoutMs` has passed.
 * Returns true when the wait timed out (output may be truncated). Does not
 * change process.exitCode; callers keep their existing exit codes.
 */
export async function flushOutput(timeoutMs = DEFAULT_FLUSH_TIMEOUT_MS): Promise<boolean> {
  if (pending.size === 0) return false;
  const waiting = [...pending];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    Promise.all(waiting).then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), timeoutMs);
      timer.unref?.();
    }),
  ]);
  clearTimeout(timer);
  // Drop waiters that never completed so a later flush is not blocked by them.
  if (timedOut) {
    for (const done of waiting) pending.delete(done);
    // Observable signal only — do not change exit codes. writeSync bypasses the
    // tracked wrapper so this diagnostic is not itself left pending.
    try {
      writeSync(
        2,
        "Warning: timed out waiting for stdout/stderr to flush; output may be truncated.\n" +
          "警告：等待标准输出刷新超时，输出可能被截断。\n",
      );
    } catch {
      // stderr may already be broken; ignore.
    }
  }
  return timedOut;
}
