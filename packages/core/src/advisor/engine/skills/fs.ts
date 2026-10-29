/**
 * skills/fs.ts — Sandboxed file access for skill execution (Level 3).
 *
 * read_file is restricted to the skills directory. Path traversal (`..`),
 * absolute paths outside the root, and symlink escapes are all rejected.
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { getSkillsDir } from "./loader.ts";

/** Max bytes returned by read_file to protect the context window. */
const MAX_READ_BYTES = 64 * 1024;

export interface ReadFileResult {
  ok: boolean;
  content?: string;
  error?: string;
  truncated?: boolean;
}

/**
 * Resolve and validate a path against the skills root.
 * Returns the resolved absolute path, or an error string.
 */
function resolveInSandbox(
  pathInput: string,
  basePath?: string,
): { resolved?: string; error?: string } {
  const skillsRoot = realpathSafe(getSkillsDir());
  if (!skillsRoot) return { error: "skills directory not found" };

  // Resolve relative to the skill's basePath if provided, otherwise to skills root
  const anchor = basePath ? (realpathSafe(basePath) ?? skillsRoot) : skillsRoot;
  const resolved = resolve(anchor, pathInput);

  // Must be inside the skills root
  if (!isInside(resolved, skillsRoot)) {
    return { error: `path escapes the skills sandbox: ${pathInput}` };
  }

  // Double-check after resolving symlinks
  const real = realpathSafe(resolved);
  if (real && !isInside(real, skillsRoot)) {
    return { error: `symlink escapes the skills sandbox: ${pathInput}` };
  }

  return { resolved };
}

function realpathSafe(p: string): string | undefined {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
}

function isInside(child: string, root: string): boolean {
  return child === root || child.startsWith(root + sep);
}

export interface SearchFileResult {
  ok: boolean;
  /** Matching lines, prefixed with "lineNo: ". */
  matches?: string[];
  totalMatches?: number;
  error?: string;
}

/** Max matching lines returned, to bound context usage. */
const MAX_MATCH_LINES = 40;
/** Max file size searchable (skip giant files). */
const MAX_SEARCH_BYTES = 4 * 1024 * 1024;

/**
 * Search a file inside the sandbox for a case-insensitive substring.
 * The whole file is scanned on disk; only matching lines enter the context.
 * This is the right tool for large jsonl files (models.jsonl etc.).
 */
export function sandboxedSearch(
  pathInput: string,
  pattern: string,
  basePath?: string,
): SearchFileResult {
  const { resolved, error } = resolveInSandbox(pathInput, basePath);
  if (error || !resolved) return { ok: false, error: error ?? "resolve failed" };
  const needle = pattern.toLowerCase();
  try {
    const stat = statSync(resolved);
    if (!stat.isFile()) return { ok: false, error: "not a regular file" };
    if (stat.size > MAX_SEARCH_BYTES)
      return { ok: false, error: `file too large to search (${stat.size} bytes)` };
    const text = readFileSync(resolved, "utf-8");
    const lines = text.split("\n");
    const matches: string[] = [];
    let total = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        total++;
        if (matches.length < MAX_MATCH_LINES) matches.push(`${i + 1}: ${lines[i]}`);
      }
    }
    return { ok: true, matches, totalMatches: total };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Read a file within the skills sandbox.
 * @param pathInput - relative (to basePath or skills root) or absolute path
 * @param basePath - the active skill's base directory for relative resolution
 */
export function sandboxedReadFile(pathInput: string, basePath?: string): ReadFileResult {
  const { resolved, error } = resolveInSandbox(pathInput, basePath);
  if (error || !resolved) return { ok: false, error: error ?? "resolve failed" };

  try {
    const stat = statSync(resolved);
    if (!stat.isFile()) return { ok: false, error: "not a regular file" };
    const buf = readFileSync(resolved);
    const truncated = buf.length > MAX_READ_BYTES;
    const content = buf.subarray(0, MAX_READ_BYTES).toString("utf-8");
    return { ok: true, content, truncated };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
