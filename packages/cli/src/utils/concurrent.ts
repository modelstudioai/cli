/**
 * Generic concurrent execution utility.
 *
 * Allows any command to run N parallel API requests and aggregate results.
 * Used via the global `--concurrent <N>` flag.
 *
 * @example
 *   const results = await runConcurrent(3, config, () => callApi());
 */

import type { Config, GlobalFlags } from "bailian-cli-core";

/** Resolve concurrency from flags (defaults to 1). */
export function getConcurrency(flags: GlobalFlags): number {
  const n = flags.concurrent as number | undefined;
  return Math.max(1, n ?? 1);
}

/**
 * Run an async task N times concurrently.
 * Returns all resolved results in order.
 * If any single task fails, the error propagates (Promise.all semantics).
 *
 * @param n       Number of concurrent executions
 * @param config  CLI config (for logging)
 * @param task    Async factory to execute
 * @param label   Optional label for status output (e.g. "requests", "tasks")
 */
export async function runConcurrent<T>(
  n: number,
  config: Config,
  task: (index: number) => Promise<T>,
  label = "requests",
): Promise<T[]> {
  if (n <= 1) {
    const result = await task(0);
    return [result];
  }

  if (!config.quiet) {
    process.stderr.write(`[Concurrent: ${n} ${label}]\n`);
  }

  const tasks = Array.from({ length: n }, (_, i) => task(i));
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
