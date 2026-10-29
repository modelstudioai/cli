import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Never steal a stale lock automatically: an interrupted remote task may still be running. */
export function acquireMediaLock(lockDirectory: string): () => void {
  mkdirSync(lockDirectory);
  writeFileSync(
    join(lockDirectory, "owner.json"),
    JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
  );
  return () => rmSync(lockDirectory, { recursive: true });
}

/** Claim before sending a creation request. A timeout still spends this run's budget. */
export function claimMediaParse(runDirectory: string, resource: Record<string, unknown>): void {
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(
    join(runDirectory, "parse-claimed.json"),
    JSON.stringify({ ...resource, claimedAt: new Date().toISOString() }),
    { flag: "wx" },
  );
}

function probeDuration(filePath: string): number {
  const raw = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { encoding: "utf8", timeout: 10_000, maxBuffer: 64 * 1024 },
  );
  return Number(raw.trim());
}

export function validateMediaSample(
  filePath: string,
  durationProbe: (filePath: string) => number = probeDuration,
): void {
  const stats = statSync(filePath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > 5 * 1024 * 1024)
    throw new Error("RAG media fixture must be a nonempty file of at most 5 MiB.");
  const duration = durationProbe(filePath);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 10)
    throw new Error("RAG media fixture duration must be positive and at most 10 seconds.");
}

/** Discover existing IDs through the public list commands; bounded reads, no registration. */
export async function discoverMediaFile(
  query: (args: string[]) => Promise<unknown>,
  collectionId: string,
  fileName: string,
): Promise<string> {
  const parents: Array<string | undefined> = [undefined];
  const visited = new Set<string>();
  let reads = 0;
  async function read(args: string[]): Promise<{
    data?: {
      categoryList?: Array<{ categoryId?: string }>;
      fileList?: Array<{ fileId?: string; fileName?: string }>;
      nextToken?: string;
    };
  }> {
    if (++reads > 100) throw new Error("Media fixture discovery exceeded its read budget.");
    return (await query(args)) as {
      data?: {
        categoryList?: Array<{ categoryId?: string }>;
        fileList?: Array<{ fileId?: string; fileName?: string }>;
        nextToken?: string;
      };
    };
  }
  while (parents.length) {
    const parentId = parents.shift();
    let categoryToken: string | undefined;
    const categoryTokens = new Set<string>();
    do {
      const categories = await read([
        "knowledge",
        "category",
        "list",
        "--collection-id",
        collectionId,
        ...(parentId ? ["--parent-id", parentId] : []),
        ...(categoryToken ? ["--next-token", categoryToken] : []),
      ]);
      for (const category of categories.data?.categoryList ?? []) {
        if (!category.categoryId || visited.has(category.categoryId)) continue;
        visited.add(category.categoryId);
        parents.push(category.categoryId);
        let fileToken: string | undefined;
        const fileTokens = new Set<string>();
        do {
          const files = await read([
            "knowledge",
            "file",
            "list",
            "--category-id",
            category.categoryId,
            "--name",
            fileName,
            ...(fileToken ? ["--next-token", fileToken] : []),
          ]);
          const target = files.data?.fileList?.find(
            (file) => file.fileName === fileName && file.fileId,
          );
          if (target?.fileId) return target.fileId;
          fileToken = files.data?.nextToken;
          if (fileToken && fileTokens.has(fileToken))
            throw new Error("Repeated file cursor during media fixture discovery.");
          if (fileToken) fileTokens.add(fileToken);
        } while (fileToken);
      }
      categoryToken = categories.data?.nextToken;
      if (categoryToken && categoryTokens.has(categoryToken))
        throw new Error("Repeated category cursor during media fixture discovery.");
      if (categoryToken) categoryTokens.add(categoryToken);
    } while (categoryToken);
  }
  throw new Error("The existing media fixture was not found in the test collection.");
}
