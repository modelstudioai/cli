import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";

type Localize = (text: LocalizedText) => string;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/** Missing state is distinct from unreadable or corrupt state. Reads never create files. */
export async function readStateFile(path: string, localize: Localize): Promise<unknown> {
  return (await readStateSnapshot(path, localize)).value;
}

/** Read once so the parsed checkpoint and its revision describe the same bytes. */
export async function readStateSnapshot(
  path: string,
  localize: Localize,
): Promise<{ value: unknown; revision: string | null }> {
  let contents: Buffer;
  try {
    contents = await readFile(path);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return { value: undefined, revision: null };
    throw error;
  }
  try {
    return {
      value: JSON.parse(contents.toString("utf8")),
      revision: createHash("sha256").update(contents).digest("hex"),
    };
  } catch {
    throw new BailianError(
      localize({
        "en-US": `Invalid state JSON: ${path}. Restore the checkpoint before continuing.`,
        "zh-CN": `状态文件 JSON 无效：${path}。请恢复记录后再继续。`,
      }),
      ExitCode.GENERAL,
    );
  }
}

/** Call after obtaining the state lock and before any cloud mutation. */
export async function assertStateRevision(
  path: string,
  expected: string | null,
  localize: Localize,
): Promise<void> {
  const current = await readStateSnapshot(path, localize);
  if (current.revision !== expected) {
    throw new BailianError(
      localize({
        "en-US":
          "The checkpoint changed after planning. Preview the current changes again before confirming or executing them.",
        "zh-CN": "恢复记录在生成计划后已变化。请重新预览当前变更，再确认或执行。",
      }),
      ExitCode.GENERAL,
    );
  }
}

/** Replace a checkpoint only after its complete contents have been flushed. */
export async function writeStateFile(path: string, state: unknown): Promise<void> {
  const contents = JSON.stringify(state, null, 2);
  if (contents === undefined) throw new TypeError("State must be JSON serializable");
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    try {
      await handle.writeFile(`${contents}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

/** Never automatically steal a lock: an old PID may belong to a different host. */
export async function withStateLock<Result>(
  path: string,
  localize: Localize,
  action: () => Promise<Result>,
): Promise<Result> {
  const lockPath = `${path}.lock`;
  const nonce = randomUUID();
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(lockPath, "wx", 0o600).catch((error: unknown) => {
    if (!hasCode(error, "EEXIST")) throw error;
    throw new BailianError(
      localize({
        "en-US": `State is locked: ${lockPath}. Verify that no other operation is running before removing the lock.`,
        "zh-CN": `状态文件已锁定：${lockPath}。请确认没有其他操作正在运行，再移除锁文件。`,
      }),
      ExitCode.GENERAL,
    );
  });
  try {
    try {
      await handle.writeFile(
        JSON.stringify({ nonce, pid: process.pid, hostname: hostname() }),
        "utf8",
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
    return await action();
  } finally {
    // A missing, corrupt, or replaced lock is not ours to remove. Cleanup must
    // not replace a service error with a secondary filesystem error.
    try {
      const current: unknown = JSON.parse(await readFile(lockPath, "utf8"));
      if (current && typeof current === "object" && "nonce" in current && current.nonce === nonce) {
        await rm(lockPath);
      }
    } catch {
      // Retaining an uncertain lock is safer than allowing concurrent writes.
    }
  }
}
