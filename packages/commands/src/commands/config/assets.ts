// Read/manage the local assets that `bl` writes into the output directory
// (default ~/bailian-output, overridable via the `output_dir` config key).
// Generated media is organized into per-type subdirectories: images/, videos/,
// speech/, omni/. This module discovers those files, classifies them, and
// provides safe path resolution for serving/deleting individual assets.
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

/** Category subdirectories that `bl` writes generated media into. */
const CATEGORY_DIRS = ["images", "videos", "speech", "omni"] as const;

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
 * List generated assets under `base`, newest first. Scans each known category
 * subdirectory plus any loose files directly under the base (grouped as
 * "other"). Returns the resolved base so callers can surface it in the UI.
 */
export function listAssets(base: string = defaultOutputBase()): {
  base: string;
  assets: AssetInfo[];
} {
  const assets: AssetInfo[] = [];
  if (!existsSync(base)) return { base, assets };

  const seen = new Set<string>();
  const addFile = (full: string, category: string): void => {
    if (seen.has(full)) return;
    seen.add(full);
    let st;
    try {
      st = statSync(full);
    } catch {
      return;
    }
    if (!st.isFile()) return;
    const ext = extname(full);
    assets.push({
      name: full.split(sep).pop() ?? full,
      category,
      kind: kindOf(ext),
      relPath: relative(base, full),
      size: st.size,
      mtime: st.mtimeMs,
      ext: ext.replace(/^\./, "").toLowerCase(),
    });
  };

  for (const cat of CATEGORY_DIRS) {
    const files: string[] = [];
    walk(join(base, cat), 4, files);
    for (const f of files) addFile(f, cat);
  }

  // Loose files placed directly under the base directory.
  let rootEntries: Dirent[] = [];
  try {
    rootEntries = readdirSync(base, { withFileTypes: true });
  } catch {
    rootEntries = [];
  }
  for (const e of rootEntries) {
    if (e.isFile() || e.isSymbolicLink()) addFile(join(base, e.name), "other");
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
