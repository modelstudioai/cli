import { httpTransport } from "bailian-cli-core";
import { createWriteStream, mkdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BailianError, ExitCode } from "bailian-cli-core";
import { createProgressBar } from "../output/progress.ts";
import type { ReadableStreamReadResult } from "stream/web";

export async function downloadFile(
  url: string,
  destPath: string,
  opts?: { quiet?: boolean; signal?: AbortSignal },
): Promise<{ size: number }> {
  const res = opts?.signal
    ? await httpTransport.fetch(url, { signal: opts.signal })
    : await httpTransport.fetch(url);

  if (!res.ok) {
    throw new BailianError(`Download failed: HTTP ${res.status}`, ExitCode.GENERAL);
  }

  const contentLength = Number(res.headers.get("content-length") || 0);
  if (!res.body) throw new BailianError("No response body", ExitCode.GENERAL);

  if (opts?.signal) {
    // Keep an existing output intact until the entire timed download succeeds.
    return await downloadWithDeadline(res.body, destPath, contentLength, opts.signal, opts.quiet);
  }

  const reader = res.body.getReader();
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

async function downloadWithDeadline(
  body: NonNullable<Response["body"]>,
  destPath: string,
  contentLength: number,
  signal: AbortSignal,
  quiet: boolean | undefined,
): Promise<{ size: number }> {
  const parentDirectory = dirname(destPath);
  mkdirSync(parentDirectory, { recursive: true });
  const directory = await mkdtemp(join(parentDirectory, ".bailian-audio-"));
  const partialPath = join(directory, "partial");
  const progress =
    contentLength > 0 && !quiet ? createProgressBar(contentLength, "Downloading") : null;
  let received = 0;
  try {
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.byteLength;
        progress?.update(received);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(body), meter, createWriteStream(partialPath), { signal });
    signal.throwIfAborted();
    await rename(partialPath, destPath);
    return { size: received };
  } finally {
    progress?.finish();
    await rm(directory, { recursive: true, force: true });
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
