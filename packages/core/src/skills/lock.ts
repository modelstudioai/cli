import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config/paths.ts";
import type { SkillLockEntry, SkillLockFile } from "./types.ts";

/**
 * Local skill state: canonical directory + skill-lock.json.
 *
 * The lock only records "installation facts" (version, timestamp, fan-out links) and never
 * caches the remote index — list/update diffs are always "live remote index vs lock".
 * Paths follow the config.json directory logic (BAILIAN_CONFIG_DIR can redirect everything).
 */
export function getSkillsDir(): string {
  return join(getConfigDir(), "skills");
}

export function getSkillLockPath(): string {
  return join(getSkillsDir(), "skill-lock.json");
}

export function emptySkillLock(): SkillLockFile {
  return { version: 1, skills: {} };
}

/**
 * Read installation records. Returns an empty lock when the file is absent (first install),
 * corrupted, or has an unrecognized version — an empty lock is a valid initial state, not an
 * error; subsequent install actions will rebuild correct records.
 */
export function readSkillLock(): SkillLockFile {
  const path = getSkillLockPath();
  if (!existsSync(path)) return emptySkillLock();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as SkillLockFile;
    if (parsed?.version !== 1 || typeof parsed.skills !== "object" || parsed.skills === null) {
      return emptySkillLock();
    }
    return parsed;
  } catch {
    return emptySkillLock();
  }
}

export function writeSkillLock(lock: SkillLockFile): void {
  mkdirSync(getSkillsDir(), { recursive: true });
  writeFileSync(getSkillLockPath(), JSON.stringify(lock, null, 2) + "\n");
}

/**
 * Merge-update a single skill's installation record (read-modify-write).
 * Shallow-merges with the existing entry: fields not provided in patch (typically links —
 * agent fan-out records) are preserved, preventing "install-only, no fan-out" sync channels
 * like postinstall/advisor from overwriting link records established by bl skill add.
 */
export function upsertSkillLockEntry(name: string, patch: SkillLockEntry): void {
  const lock = readSkillLock();
  lock.skills[name] = { ...lock.skills[name], ...patch };
  writeSkillLock(lock);
}
