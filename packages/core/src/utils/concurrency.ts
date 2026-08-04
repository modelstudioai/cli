/**
 * Run async task factories with a bounded concurrency pool.
 * Returns results in the same order as the input tasks array.
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
