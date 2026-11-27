import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

const OWNER_NAME = /^owner-([1-9]\d*)-[a-f0-9-]{36}$/u;
const CONTENTION_CODES = new Set(["EEXIST", "ENOTEMPTY", "ENOTDIR", "EISDIR"]);

function ownerAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0 || pid > 0x7fff_ffff) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function releaseLock(path: string, owner?: string): Promise<void> {
  // Only the matching marker can be removed; rmdir never removes a replacement lock with a live owner.
  if (owner) await unlink(join(path, owner)).catch(() => {});
  await rmdir(path).catch(() => {});
}

async function recoverLock(path: string): Promise<void> {
  const status = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (status?.isFile()) {
    // An older writer can replace this file between any ownership check and unlink.
    throw new BailianError(
      `Legacy lock file at ${path}. / 检测到旧版锁文件：${path}。`,
      ExitCode.GENERAL,
      "Stop older CLI processes and retry. If the file remains after confirming that nothing is using it, move it aside. / 请退出旧版 CLI 进程后重试；若确认锁文件已无人使用但仍存在，请将其移走。",
    );
  }
  if (!status?.isDirectory()) return;
  const entries = await readdir(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (entries?.length === 0) await releaseLock(path);
  else if (entries?.length === 1) {
    const owner = entries[0]!;
    const match = OWNER_NAME.exec(owner);
    if (match && !ownerAlive(Number(match[1]))) await releaseLock(path, owner);
  }
}

export async function withFileLock<Result>(
  path: string,
  operation: () => Promise<Result>,
  timeout = 30_000,
): Promise<Result> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const candidate = await mkdtemp(`${path}.`);
  const owner = `owner-${process.pid}-${randomUUID()}`;
  let acquired = false;
  const deadline = Date.now() + timeout;
  try {
    await writeFile(join(candidate, owner), "", { mode: 0o600 });
    for (;;) {
      try {
        // Publish a nonempty directory atomically; rename cannot replace another owner's nonempty lock.
        await rename(candidate, path);
        acquired = true;
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const windowsCollision =
          process.platform === "win32" && (code === "EPERM" || code === "EACCES");
        if (!CONTENTION_CODES.has(code ?? "") && !windowsCollision) throw error;
        await recoverLock(path);
        if (Date.now() >= deadline) {
          throw new BailianError(
            "Timed out waiting for the credential/configuration lock. / 等待凭据或配置锁超时。",
            ExitCode.TIMEOUT,
          );
        }
        await delay(25);
      }
    }
    return await operation();
  } finally {
    // A cleanup error must not make a committed operation look like a failed write.
    if (acquired) await releaseLock(path, owner);
    else await rm(candidate, { recursive: true, force: true }).catch(() => {});
  }
}
