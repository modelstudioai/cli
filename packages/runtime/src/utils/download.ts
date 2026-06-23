import { createWriteStream, mkdirSync, unlinkSync } from "fs";
import { dirname } from "path";
import { BailianError, ExitCode, trackingHeaders } from "bailian-cli-core";
import { createProgressBar } from "../output/progress.ts";
import type { ReadableStreamReadResult } from "stream/web";

export async function downloadFile(
  url: string,
  destPath: string,
  opts?: { quiet?: boolean },
): Promise<{ size: number }> {
  const res = await fetch(url, {
    headers: trackingHeaders(),
  });

  if (!res.ok) {
    throw new BailianError(`Download failed: HTTP ${res.status}`, ExitCode.GENERAL);
  }

  const contentLength = Number(res.headers.get("content-length") || 0);
  const reader = res.body?.getReader();
  if (!reader) throw new BailianError("No response body", ExitCode.GENERAL);

  mkdirSync(dirname(destPath), { recursive: true });
  const writer = createWriteStream(destPath);
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
        unlinkSync(destPath);
      } catch {
        /* best effort */
      }
    }
  }

  return { size: received };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
