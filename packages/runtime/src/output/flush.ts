/**
 * Track every stdout/stderr write so the process can exit only after the data
 * reached the OS. Bun does not order an empty write's callback after earlier
 * writes and does not report writableLength, so the callback of each real write
 * is the only reliable completion signal on both Node and Bun.
 */

import { writeSync } from "node:fs";

const pending = new Set<Promise<void>>();
const tracked = new WeakSet<NodeJS.WriteStream>();

/** Default idle window when a numeric timeout is requested. */
export const DEFAULT_FLUSH_TIMEOUT_MS = 5000;

/** Short hard deadline for Ctrl-C / broken-pipe paths. */
export const INTERRUPT_FLUSH_TIMEOUT_MS = 500;

type WriteCallback = (error?: Error | null) => void;

export type FlushOutputOptions = {
  /**
   * `idle` (default): reset the timer whenever a write completes; time out only
   * after `timeoutMs` with no progress. `deadline`: one shot from start.
   */
  mode?: "idle" | "deadline";
  /** Skip the plain-text diagnostic when stderr must stay JSON-only. */
  format?: "text" | "json";
};

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

function emitFlushTimeoutWarning(format: "text" | "json" | undefined): void {
  // JSON mode must keep stderr as parseable JSON lines; skip the plain warning.
  if (format === "json") return;
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

/**
 * Wait until every tracked write has completed.
 *
 * - `timeoutMs === null`: wait until all pending writes finish (no truncation on
 *   slow readers such as `| less`).
 * - numeric + `mode: "idle"`: reset the timer on each write completion; time out
 *   only after `timeoutMs` with no progress.
 * - numeric + `mode: "deadline"`: hard cap from the start (interrupt paths).
 *
 * Returns true when the wait timed out. Does not change process.exitCode.
 */
export async function flushOutput(
  timeoutMs: number | null = DEFAULT_FLUSH_TIMEOUT_MS,
  options: FlushOutputOptions = {},
): Promise<boolean> {
  if (pending.size === 0) return false;

  if (timeoutMs === null) {
    await Promise.all(pending);
    return false;
  }

  const mode = options.mode ?? "idle";
  const waiting = [...pending];
  let timedOut = false;

  if (mode === "deadline") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    timedOut = await Promise.race([
      Promise.all(waiting).then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), timeoutMs);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
  } else {
    timedOut = await new Promise<boolean>((resolve) => {
      let finished = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (timedOutResult: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(timedOutResult);
      };

      const armIdle = () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(true), timeoutMs);
        timer.unref?.();
      };

      const onProgress = () => {
        if (finished) return;
        if (pending.size === 0) {
          finish(false);
          return;
        }
        armIdle();
      };

      for (const item of waiting) void item.then(onProgress);
      armIdle();
    });
  }

  if (timedOut) {
    for (const done of waiting) pending.delete(done);
    emitFlushTimeoutWarning(options.format);
  }
  return timedOut;
}
