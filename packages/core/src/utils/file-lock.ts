import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export async function withFileLock<Result>(
  path: string,
  operation: () => Promise<Result>,
  timeout = 30_000,
): Promise<Result> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const ownership = JSON.stringify({ pid: process.pid, id: randomUUID() });
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      const handle = await open(path, "wx", 0o600);
      try {
        await handle.writeFile(ownership);
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const previous = await readFile(path, "utf8").catch((readError: NodeJS.ErrnoException) => {
        if (readError.code === "ENOENT") return undefined;
        throw readError;
      });
      if (previous === undefined) continue;
      let owner: { pid?: unknown } = {};
      try {
        owner = JSON.parse(previous);
      } catch {
        // A live writer may not have finished writing its ownership record.
      }
      if (typeof owner.pid === "number" && Number.isInteger(owner.pid) && owner.pid > 0) {
        try {
          process.kill(owner.pid, 0);
        } catch (ownerError) {
          if ((ownerError as NodeJS.ErrnoException).code === "ESRCH") {
            const recoveryPath = `${path}.recovery`;
            const recovery = await open(recoveryPath, "wx", 0o600).catch(
              (recoveryError: NodeJS.ErrnoException) => {
                if (recoveryError.code === "EEXIST") return undefined;
                throw recoveryError;
              },
            );
            if (recovery) {
              try {
                if ((await readFile(path, "utf8").catch(() => undefined)) === previous) {
                  await unlink(path).catch((removeError: NodeJS.ErrnoException) => {
                    if (removeError.code !== "ENOENT") throw removeError;
                  });
                }
              } finally {
                await recovery.close();
                await unlink(recoveryPath);
              }
            }
          }
        }
      }
      if (Date.now() >= deadline) {
        throw new BailianError(
          "Timed out waiting for the credential/configuration lock. / 等待凭据或配置锁超时。",
          ExitCode.TIMEOUT,
        );
      }
      await delay(25);
    }
  }
  try {
    return await operation();
  } finally {
    if ((await readFile(path, "utf8").catch(() => undefined)) === ownership) {
      await unlink(path);
    }
  }
}
