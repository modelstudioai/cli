/**
 * Generic concurrent execution utility.
 *
 * Allows any command to run N parallel API requests and aggregate results.
 * Used by commands that declare `--concurrent <N>`.
 *
 * @example
 *   const results = await runConcurrent(3, output, () => callApi());
 */

import type { CommandOutput } from "bailian-cli-core";

/** Resolve concurrency from parsed command flags(`--concurrent`,defaults to 1). */
export function getConcurrency(flags: { concurrent?: number }): number {
  return Math.max(1, flags.concurrent ?? 1);
}

/**
 * Run an async task N times concurrently.
 * Returns all resolved results in order.
 * If any single task fails, the error propagates (Promise.all semantics).
 *
 * @param count    Number of concurrent executions
 * @param output   Invocation output for process information
 * @param task     Async factory to execute
 * @param label    Optional label for status output (e.g. "requests", "tasks")
 */
export async function runConcurrent<T>(
  count: number,
  output: Pick<CommandOutput, "info">,
  task: (index: number) => Promise<T>,
  label: "requests" | "tasks" = "requests",
): Promise<T[]> {
  if (count <= 1) {
    const result = await task(0);
    return [result];
  }

  output.info({
    "en-US": `[Concurrent: ${count} ${label}]`,
    "zh-CN": `[并发：${count} ${label === "tasks" ? "个任务" : "个请求"}]`,
  });

  const tasks = Array.from({ length: count }, (_entry, index) => task(index));
  return Promise.all(tasks);
}

/**
 * Parallel download helper — downloads multiple URLs concurrently.
 *
 * @param items  Array of { url, destPath } pairs
 * @param downloadFn  Download function (url, destPath, opts) => Promise
 * @param opts   Options passed to download function
 * @returns Array of saved file paths in order
 */
export async function downloadParallel(
  items: Array<{ url: string; destPath: string }>,
  downloadFn: (url: string, destPath: string, opts?: { quiet?: boolean }) => Promise<unknown>,
  opts?: { quiet?: boolean },
): Promise<string[]> {
  return Promise.all(
    items.map(({ url, destPath }) => downloadFn(url, destPath, opts).then(() => destPath)),
  );
}
