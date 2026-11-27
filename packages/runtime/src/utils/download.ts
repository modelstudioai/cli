import { BailianError, ExitCode, httpTransport } from "bailian-cli-core";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  createWriteStream,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
} from "fs";
import { dirname, join } from "path";
import { pipeline } from "node:stream/promises";
import { createProgressBar } from "../output/progress.ts";

function resolveDownloadTarget(destPath: string): { path: string; mode?: number } {
  let entry;
  try {
    entry = lstatSync(destPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path: destPath };
    throw error;
  }

  // Keep the link itself intact. A dangling link must fail instead of guessing a target.
  const targetPath = realpathSync.native(destPath);
  const stats = entry.isSymbolicLink() ? statSync(targetPath) : entry;
  if (!stats.isFile()) {
    throw new BailianError(
      `Download destination must be a regular file: ${targetPath}`,
      ExitCode.USAGE,
    );
  }
  return { path: targetPath, mode: stats.mode & 0o7777 };
}

export async function downloadFile(
  url: string,
  destPath: string,
  opts?: { quiet?: boolean },
): Promise<{ size: number }> {
  const target = resolveDownloadTarget(destPath);
  const res = await httpTransport.fetch(url);

  if (!res.ok) {
    throw new BailianError(`Download failed: HTTP ${res.status}`, ExitCode.GENERAL);
  }
  const body = res.body;
  if (!body) throw new BailianError("No response body", ExitCode.GENERAL);

  const targetDir = dirname(target.path);
  mkdirSync(targetDir, { recursive: true });
  const tempPath = join(realpathSync.native(targetDir), `.download-${randomUUID()}.part`);
  const descriptor = openSync(tempPath, "wx", target.mode);
  const contentLength = Number(res.headers.get("content-length") || 0);
  const progress =
    contentLength > 0 && !opts?.quiet ? createProgressBar(contentLength, "Downloading") : null;
  let received = 0;

  try {
    await pipeline(
      async function* ({ signal }: { signal?: AbortSignal } = {}) {
        const reader = body.getReader();
        const cancel = () => {
          void reader.cancel(signal?.reason).catch(() => {});
        };
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            received += value.byteLength;
            progress?.update(received);
            yield value;
          }
        } finally {
          signal?.removeEventListener("abort", cancel);
          reader.releaseLock();
        }
      },
      createWriteStream(tempPath, { fd: descriptor }),
    ).finally(() => progress?.finish());
    if (target.mode !== undefined) chmodSync(tempPath, target.mode);
    renameSync(tempPath, target.path);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup of the temporary file.
    }
    throw error;
  }

  return { size: received };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
