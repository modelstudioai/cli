/**
 * tar.br archive extraction and atomic swap — shared by advisor wiki sync and `bl skill` install.
 * Symmetric with the publisher (FC skills-publish.mjs: tar.pack + brotli); uses only Node built-in
 * zlib + tar-stream, no extra decompression dependencies.
 */
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
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

export const WINDOWS_LEGACY_MAX_PATH = 259;

export interface WindowsPathViolation {
  root: string;
  relativePath: string;
  pathLength: number;
}

/**
 * Project an extracted tree onto Windows-visible roots and return the longest path
 * that exceeds the legacy MAX_PATH budget. This protects host agents that do not
 * opt into long-path support even when the Node.js installer itself can write it.
 */
export function findWindowsPathViolation(
  sourceDir: string,
  projectedRoots: string[],
  maxPath = WINDOWS_LEGACY_MAX_PATH,
): WindowsPathViolation | undefined {
  let longestViolation: WindowsPathViolation | undefined;
  const visit = (currentDir: string): void => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const sourcePath = join(currentDir, entry.name);
      const relativePath = relative(sourceDir, sourcePath);
      for (const root of projectedRoots) {
        const pathLength = join(root, relativePath).length;
        if (pathLength > maxPath && pathLength > (longestViolation?.pathLength ?? 0)) {
          longestViolation = { root, relativePath, pathLength };
        }
      }
      if (entry.isDirectory()) visit(sourcePath);
    }
  };

  for (const root of projectedRoots) {
    if (root.length > maxPath && root.length > (longestViolation?.pathLength ?? 0)) {
      longestViolation = { root, relativePath: "", pathLength: root.length };
    }
  }
  visit(sourceDir);
  return longestViolation;
}

interface TreeEntry {
  relativePath: string;
  type: "directory" | "file";
}

function listTreeEntries(rootDir: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  const visit = (currentDir: string): void => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(currentDir, entry.name);
      const relativePath = relative(rootDir, path);
      if (entry.isDirectory()) {
        entries.push({ relativePath, type: "directory" });
        visit(path);
      } else if (entry.isFile()) {
        entries.push({ relativePath, type: "file" });
      }
    }
  };
  visit(rootDir);
  return entries;
}

/** Replace children without renaming the root directory, which may be held open on Windows. */
function reconcileDirectoryContents(sourceDir: string, destDir: string): void {
  const sourceEntries = listTreeEntries(sourceDir);
  const expectedPaths = new Set(sourceEntries.map((entry) => entry.relativePath));
  mkdirSync(destDir, { recursive: true });

  for (const entry of sourceEntries) {
    const sourcePath = join(sourceDir, entry.relativePath);
    const destPath = join(destDir, entry.relativePath);
    if (existsSync(destPath)) {
      const destStat = lstatSync(destPath);
      const typeMatches = entry.type === "directory" ? destStat.isDirectory() : destStat.isFile();
      if (!typeMatches || destStat.isSymbolicLink()) {
        rmSync(destPath, { recursive: true, force: true });
      }
    }
    if (entry.type === "directory") {
      mkdirSync(destPath, { recursive: true });
    } else {
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(sourcePath, destPath);
    }
  }

  const staleEntries = listTreeEntries(destDir)
    .filter((entry) => !expectedPaths.has(entry.relativePath))
    .sort((left, right) => right.relativePath.length - left.relativePath.length);
  for (const entry of staleEntries) {
    rmSync(join(destDir, entry.relativePath), { recursive: true, force: true });
  }
}

function isBlockedRenameError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EBUSY";
}

function cleanupBackup(backup: string): void {
  try {
    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  } catch {
    /* keep the backup on disk rather than report a completed install as failed */
  }
}

export interface AtomicSwapOptions {
  /** Test seam; defaults to enabled only on Windows. */
  allowInPlaceFallback?: boolean;
}

/**
 * Atomic swap: replace destDir with the extracted content from tmpDir.
 * tmpDir must be on the same volume as destDir (same parent) for renameSync to be atomic.
 * If Windows blocks renaming an agent-open directory, preserve a copied backup and
 * reconcile its children in place so the stable directory handle remains valid.
 */
export function atomicSwap(tmpDir: string, destDir: string, options: AtomicSwapOptions = {}): void {
  mkdirSync(dirname(destDir), { recursive: true });
  const backup = `${destDir}.old-${Date.now()}`;
  if (existsSync(destDir)) {
    try {
      renameSync(destDir, backup);
    } catch (error) {
      const allowInPlaceFallback = options.allowInPlaceFallback ?? process.platform === "win32";
      if (!allowInPlaceFallback || !isBlockedRenameError(error)) throw error;

      try {
        reconcileDirectoryContents(destDir, backup);
        reconcileDirectoryContents(tmpDir, destDir);
        cleanupBackup(backup);
        return;
      } catch (fallbackError) {
        try {
          if (existsSync(backup)) reconcileDirectoryContents(backup, destDir);
        } catch {
          /* retain backup for manual recovery if an open file also blocks rollback */
        }
        throw new Error(
          `Skill directory is in use and could not be updated in place. Close running agent hosts and retry. / Skill 目录正被占用，无法原地更新；请关闭正在运行的 Agent 后重试。 ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          { cause: fallbackError },
        );
      }
    }
  }
  try {
    renameSync(tmpDir, destDir);
  } catch (error) {
    // Swap failed → roll back the old directory to avoid leaving a hole
    if (existsSync(backup) && !existsSync(destDir)) renameSync(backup, destDir);
    throw error;
  }
  // Best-effort cleanup: the swap already succeeded, so a backup deletion failure
  // (permissions, host safe-delete guards on large dirs) must not fail the install;
  // leftover .old-* dirs are inert (skill status scans ignore them)
  cleanupBackup(backup);
}
