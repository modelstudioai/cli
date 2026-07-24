/**
 * tar.br archive extraction and atomic swap — shared by advisor wiki sync and `bl skill` install.
 * Symmetric with the publisher (FC skills-publish.mjs: tar.pack + brotli); uses only Node built-in
 * zlib + tar-stream, no extra decompression dependencies.
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import tar from "tar-stream";

/** tar 条目路径必须是相对路径且不含 ..，防止 tar-slip 逃逸解包目录 */
export function isSafeEntryName(name: string): boolean {
  if (name.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(name)) return false;
  return !name.split("/").includes("..");
}

/** Brotli decompress + tar-stream extract into destDir (per-entry path safety check). */
export async function extractTarBr(tarBrBuffer: Buffer, destDir: string): Promise<void> {
  const extract = tar.extract();

  extract.on("entry", (header, stream, next) => {
    if (!isSafeEntryName(header.name)) {
      // Use destroy so the pipeline rejects with this error; silence the entry stream
      // to avoid its companion error becoming an unhandled exception
      stream.on("error", () => {});
      stream.resume();
      extract.destroy(new Error(`unsafe tar entry: ${header.name}`));
      return;
    }
    const filePath = join(destDir, header.name);
    if (header.type === "directory") {
      mkdirSync(filePath, { recursive: true });
      stream.resume();
      stream.on("end", next);
      return;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    const ws = createWriteStream(filePath);
    stream.pipe(ws);
    ws.on("finish", next);
    ws.on("error", next);
  });

  await pipeline(Readable.from(tarBrBuffer), createBrotliDecompress(), extract);
}

/**
 * Atomic swap: replace destDir with the extracted content from tmpDir.
 * tmpDir must be on the same volume as destDir (same parent) for renameSync to be atomic.
 */
export function atomicSwap(tmpDir: string, destDir: string): void {
  mkdirSync(dirname(destDir), { recursive: true });
  const backup = `${destDir}.old-${Date.now()}`;
  if (existsSync(destDir)) renameSync(destDir, backup);
  try {
    renameSync(tmpDir, destDir);
  } catch (err) {
    // Swap failed → roll back the old directory to avoid leaving a hole
    if (existsSync(backup) && !existsSync(destDir)) renameSync(backup, destDir);
    throw err;
  }
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
}
