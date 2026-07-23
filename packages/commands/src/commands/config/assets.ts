// Read/manage the local assets that `bl` writes into the output directory
// (default ~/bailian-output, overridable via the `output_dir` config key).
// Generated media may live directly under the base or in any subfolder (bl's
// own images/, videos/, speech/, omni/, or user-created folders). This module
// recursively discovers every file under the base, classifies each by type,
// derives its category from the top-level folder, and provides safe path
// resolution for serving/deleting individual assets.
import { readdirSync, statSync, existsSync, type Dirent } from "node:fs";
import { homedir } from "node:os";
import { join, extname, relative, resolve, sep } from "node:path";

export type AssetKind = "image" | "video" | "audio" | "other";

/** One generated file discovered under the output directory. */
export interface AssetInfo {
  name: string;
  /** Category folder the file lives in: images | videos | speech | omni | other. */
  category: string;
  kind: AssetKind;
  /** Path relative to the output base (used as the API handle). */
  relPath: string;
  size: number;
  /** Modification time in epoch milliseconds ~= generation time. */
  mtime: number;
  ext: string;
}

/** Max directory depth to descend from the output base when scanning. */
const MAX_SCAN_DEPTH = 8;

const KIND_BY_EXT: Record<string, AssetKind> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".bmp": "image",
  ".svg": "image",
  ".mp4": "video",
  ".mov": "video",
  ".webm": "video",
  ".mkv": "video",
  ".avi": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
  ".aac": "audio",
  ".flac": "audio",
  ".ogg": "audio",
};

const CONTENT_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
};

/** The default output base when `output_dir` is not configured. */
export function defaultOutputBase(home: string = homedir()): string {
  return join(home, "bailian-output");
}

function kindOf(ext: string): AssetKind {
  return KIND_BY_EXT[ext.toLowerCase()] ?? "other";
}

/** MIME type for serving an asset; falls back to a safe binary type. */
export function contentType(ext: string): string {
  return CONTENT_TYPE[ext.toLowerCase()] ?? "application/octet-stream";
}

/** Recursively collect regular files under `dir`, descending at most `depth` levels. */
function walk(dir: string, depth: number, out: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0) walk(full, depth - 1, out);
    } else if (e.isFile() || e.isSymbolicLink()) {
      out.push(full);
    }
  }
}

/**
 * List generated assets under `base`, newest first. Recursively scans every
 * subfolder under the base (plus loose files at the root), so assets in bl's
 * own category dirs and any user-created folders are all discovered. Each
 * file's `category` is its top-level folder name, or "other" for root files.
 * Returns the resolved base so callers can surface it in the UI.
 */
export function listAssets(base: string = defaultOutputBase()): {
  base: string;
  assets: AssetInfo[];
} {
  const assets: AssetInfo[] = [];
  if (!existsSync(base)) return { base, assets };

  const files: string[] = [];
  walk(base, MAX_SCAN_DEPTH, files);

  for (const full of files) {
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const rel = relative(base, full);
    const segments = rel.split(sep);
    const category = segments.length > 1 ? segments[0]! : "other";
    const ext = extname(full);
    assets.push({
      name: full.split(sep).pop() ?? full,
      category,
      kind: kindOf(ext),
      relPath: rel,
      size: st.size,
      mtime: st.mtimeMs,
      ext: ext.replace(/^\./, "").toLowerCase(),
    });
  }

  assets.sort((a, b) => b.mtime - a.mtime);
  return { base, assets };
}

/**
 * Resolve a client-supplied relative path to an absolute path strictly inside
 * `base`. Returns null for empty input or any path that would escape the base
 * (path traversal guard).
 */
export function resolveAssetPath(base: string, relPath: string): string | null {
  if (typeof relPath !== "string" || relPath.length === 0) return null;
  const root = resolve(base);
  const abs = resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}
