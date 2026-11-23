import { httpTransport } from "bailian-cli-core";
import { createWriteStream, mkdirSync, renameSync, unlinkSync } from "fs";
import { basename, dirname, join } from "path";
import { BailianError, ExitCode } from "bailian-cli-core";
import { createProgressBar } from "../output/progress.ts";
import type { ReadableStreamReadResult } from "stream/web";

/** Replace dest with temp; Windows cannot rename over an existing path. */
function publishDownloadedFile(tempPath: string, destPath: string): void {
  try {
    renameSync(tempPath, destPath);
  } catch (error) {
    const code =
      error !== null && typeof error === "object" && "code" in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    if (code === "EEXIST" || code === "EPERM") {
      unlinkSync(destPath);
      renameSync(tempPath, destPath);
      return;
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
    publishDownloadedFile(tempPath, destPath);
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
