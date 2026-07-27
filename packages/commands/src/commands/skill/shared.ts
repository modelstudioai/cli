import { UsageError } from "bailian-cli-core";

/**
 * Parse --name: `all` or a comma-separated list of skill names (deduplicated, trimmed).
 * `all` cannot be mixed with specific names.
 */
export function parseSkillNames(raw: string | undefined, defaultAll: boolean): string[] | "all" {
  const value = (raw ?? (defaultAll ? "all" : "")).trim();
  if (!value) {
    throw new UsageError("--name cannot be empty", "Use --name all or --name skill-a,skill-b");
  }
  const parts = [
    ...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  if (parts.includes("all")) {
    if (parts.length > 1) {
      throw new UsageError(
        "--name all cannot be mixed with specific skill names",
        "Use either all or a comma-separated list of names",
      );
    }
    return "all";
  }
  return parts;
}

/**
 * Run async task factories with a bounded concurrency pool.
 * Returns results in the same order as the input tasks array.
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
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
