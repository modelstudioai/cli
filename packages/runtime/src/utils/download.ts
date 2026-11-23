import { httpTransport } from "bailian-cli-core";
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "fs";
import { basename, dirname, join } from "path";
import { BailianError, ExitCode } from "bailian-cli-core";
import { createProgressBar } from "../output/progress.ts";
import type { ReadableStreamReadResult } from "stream/web";

function errnoCode(error: unknown): string | undefined {
  if (error !== null && typeof error === "object" && "code" in error) {
    return (error as NodeJS.ErrnoException).code;
  }
  return undefined;
}

/**
 * Publish temp over dest without unlinking dest first.
 * Existing dest is moved aside and restored if publish fails.
 */
function publishDownloadedFile(
  tempPath: string,
  destPath: string,
  preserveMode: number | undefined,
): void {
  if (!existsSync(destPath)) {
    renameSync(tempPath, destPath);
    return;
  }

  const backupPath = join(
    dirname(destPath),
    `.${basename(destPath)}.${process.pid}.${Date.now()}.bak`,
  );
  renameSync(destPath, backupPath);

  try {
    try {
      renameSync(tempPath, destPath);
    } catch (renameError) {
      const code = errnoCode(renameError);
      // Windows cannot rename onto an existing name; EXDEV needs a copy.
      // Never unlink dest first — backup already holds the previous bytes.
      if (code === "EEXIST" || code === "EPERM" || code === "EXDEV") {
        copyFileSync(tempPath, destPath);
        try {
          unlinkSync(tempPath);
        } catch {
          /* best effort */
        }
      } else {
        throw renameError;
      }
    }

    if (preserveMode !== undefined) {
      chmodSync(destPath, preserveMode);
    }
    unlinkSync(backupPath);
  } catch (error) {
    try {
      if (existsSync(destPath)) unlinkSync(destPath);
    } catch {
      /* best effort */
    }
    try {
      renameSync(backupPath, destPath);
    } catch {
      /* best effort */
    }
    throw error;
  }
}

export async function downloadFile(
  url: string,
  destPath: string,
  opts?: { quiet?: boolean },
): Promise<{ size: number }> {
  const res = await httpTransport.fetch(url);

  if (!res.ok) {
    throw new BailianError(`Download failed: HTTP ${res.status}`, ExitCode.GENERAL);
  }

  const contentLength = Number(res.headers.get("content-length") || 0);
  const reader = res.body?.getReader();
  if (!reader) throw new BailianError("No response body", ExitCode.GENERAL);

  mkdirSync(dirname(destPath), { recursive: true });

  let preserveMode: number | undefined;
  try {
    preserveMode = statSync(destPath).mode & 0o7777;
  } catch {
    // Destination does not exist yet.
  }

  // Same-directory temp so rename stays on one filesystem; never truncate dest until publish.
  const tempPath = join(
    dirname(destPath),
    `.${basename(destPath)}.${process.pid}.${Date.now()}.part`,
  );
  const writer = createWriteStream(tempPath);
  const progress =
    contentLength > 0 && !opts?.quiet ? createProgressBar(contentLength, "Downloading") : null;

  let received = 0;
  let completed = false;

  try {
    const writeError = new Promise<never>((_, reject) => {
      writer.on("error", reject);
    });

    while (true) {
      const { done, value } = (await Promise.race([
        reader.read(),
        writeError,
      ])) as ReadableStreamReadResult<Uint8Array>;
      if (done) break;

      const ok = writer.write(value);
      if (!ok) await new Promise<void>((resolve) => writer.once("drain", () => resolve()));

      received += value.byteLength;
      progress?.update(received);
    }
    completed = true;
  } finally {
    reader.releaseLock();
    progress?.finish();

    await new Promise<void>((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
      writer.end();
    });

    if (!completed) {
      try {
        unlinkSync(tempPath);
      } catch {
        /* best effort */
      }
    }
  }

  try {
    publishDownloadedFile(tempPath, destPath, preserveMode);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      /* best effort */
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
