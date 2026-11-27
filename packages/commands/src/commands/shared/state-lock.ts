import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { BailianError, ExitCode, type CommandContext } from "bailian-cli-core";

/** Never automatically steal a lock: an old PID may belong to a different host. */
export async function withStateLock<Result>(
  path: string,
  localize: CommandContext["localize"],
  action: () => Result | Promise<Result>,
): Promise<Result> {
  const lockPath = `${path}.lock`;
  const nonce = randomUUID();
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(lockPath, "wx", 0o600).catch((error: unknown) => {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
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
