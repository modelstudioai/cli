/**
 * tar.br archive extraction and atomic swap — shared by advisor wiki sync and `bl skill` install.
 * Symmetric with the publisher (FC skills-publish.mjs: tar.pack + brotli); uses only Node built-in
 * zlib + tar-stream, no extra decompression dependencies.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import tar from "tar-stream";

/** tar 条目路径必须是相对路径且不含 ..，防止 tar-slip 逃逸解包目录 */
export function isSafeEntryName(name: string): boolean {
  // Reject backslashes outright: on Windows path.join expands backslash-separated
  // ".." segments and a leading "\" resolves to the drive root, so such names can
  // escape the extraction dir even though they pass the "/"-based checks below.
  // The publisher always packs with "/" separators, so this never rejects legit archives.
  if (name.includes("\\") || name.includes("\0")) return false;
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
 * Recompute the publisher's deterministic content hash over an extracted directory:
 * regular files sorted by "/"-separated relative path (code-unit order, same as the
 * publisher's byte-order sort for ASCII paths), sha256 accumulating relPath + bytes.
 * Symmetric with computeContentHash in FC skills-publish.mjs.
 */
export function computeDirContentHash(dir: string): string {
  const relPaths: string[] = [];
  const walk = (sub: string): void => {
    for (const dirent of readdirSync(sub ? join(dir, sub) : dir, { withFileTypes: true })) {
      const rel = sub ? `${sub}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) walk(rel);
      else if (dirent.isFile()) relPaths.push(rel);
    }
  };
  walk("");
  relPaths.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const hash = createHash("sha256");
  for (const rel of relPaths) {
    hash.update(rel);
    hash.update(readFileSync(join(dir, rel)));
  }
  return `sha256:${hash.digest("hex")}`;
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
