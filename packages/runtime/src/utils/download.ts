import { httpTransport } from "bailian-cli-core";
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  renameSync,
  statSync,
  unlinkSync,
} from "fs";
import { basename, dirname, isAbsolute, join } from "path";
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
 * Walk the full symlink chain (including dangling links) so publish writes
 * through to the final path and leaves intermediate links intact.
 */
function resolvePublishPath(destPath: string): string {
  let current = destPath;
  const seen = new Set<string>();
  for (;;) {
    let stats;
    try {
      stats = lstatSync(current);
    } catch {
      return current;
    }
    if (!stats.isSymbolicLink()) {
      return current;
    }
    if (seen.has(current)) {
      throw new BailianError(
        `Symbolic link cycle detected while resolving download path: ${destPath}`,
        ExitCode.GENERAL,
      );
    }
    seen.add(current);
    const linkTarget = readlinkSync(current);
    current = isAbsolute(linkTarget) ? linkTarget : join(dirname(current), linkTarget);
  }
}

/**
 * Refuse directories and other non-files before publish (matches 2.10.5 EISDIR
 * fail-fast; avoids renaming a directory aside and rolling back on unlink).
 */
function assertPublishPathIsFileOrAbsent(publishPath: string): void {
  let stats;
  try {
    stats = lstatSync(publishPath);
  } catch {
    return;
  }
  if (!stats.isFile()) {
    throw new BailianError(
      `Download destination must be a regular file: ${publishPath}`,
      ExitCode.USAGE,
    );
  }
}

/** renameSync with copy fallback for Windows / cross-device publishes. */
function renameOrCopyIntoPlace(tempPath: string, destPath: string): void {
  try {
    renameSync(tempPath, destPath);
  } catch (renameError) {
    const code = errnoCode(renameError);
    // Windows cannot rename onto an existing name; EXDEV needs a copy.
    if (code === "EEXIST" || code === "EPERM" || code === "EXDEV") {
      copyFileSync(tempPath, destPath);
      try {
        unlinkSync(tempPath);
      } catch {
        /* best effort */
      }
      return;
    }
    throw renameError;
  }
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
    renameOrCopyIntoPlace(tempPath, destPath);
    return;
  }

  const backupPath = join(
    dirname(destPath),
    `.${basename(destPath)}.${process.pid}.${Date.now()}.bak`,
  );
  renameSync(destPath, backupPath);

  try {
    renameOrCopyIntoPlace(tempPath, destPath);

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
  const publishPath = resolvePublishPath(destPath);
  assertPublishPathIsFileOrAbsent(publishPath);

  const res = await httpTransport.fetch(url);

  if (!res.ok) {
    throw new BailianError(`Download failed: HTTP ${res.status}`, ExitCode.GENERAL);
  }

  const contentLength = Number(res.headers.get("content-length") || 0);
  const reader = res.body?.getReader();
  if (!reader) throw new BailianError("No response body", ExitCode.GENERAL);

  mkdirSync(dirname(publishPath), { recursive: true });

  let preserveMode: number | undefined;
  try {
    preserveMode = statSync(publishPath).mode & 0o7777;
  } catch {
    // Destination (or symlink target) does not exist yet.
  }

  // Temp beside the publish path so rename stays on one filesystem when possible.
  const tempPath = join(
    dirname(publishPath),
    `.${basename(publishPath)}.${process.pid}.${Date.now()}.part`,
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
    publishDownloadedFile(tempPath, publishPath, preserveMode);
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
