import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getSkillsDir } from "./lock.ts";
import type { SkillLockFile, SkillStatusRow, SkillsIndex } from "./types.ts";

/**
 * Three-way reconciliation for list: remote index (live) × skill-lock.json (installation facts) × disk (ground truth).
 */

/** Scan skill directories under canonical (skipping hidden entries, tmp/backup remnants, and plain files) */
export function listSkillDirsOnDisk(): string[] {
  const dir = getSkillsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((entry) => {
    if (entry.startsWith(".")) return false;
    if (entry.includes(".tmp-") || entry.includes(".old-")) return false;
    try {
      return statSync(join(dir, entry)).isDirectory();
    } catch {
      return false;
    }
  });
}

export function computeSkillStatuses(
  index: SkillsIndex,
  lock: SkillLockFile,
  diskNames: string[],
): SkillStatusRow[] {
  const disk = new Set(diskNames);
  const seen = new Set<string>();
  const rows: SkillStatusRow[] = [];

  // Skills present in remote: derive status from lock/disk
  for (const [name, entry] of Object.entries(index.skills)) {
    seen.add(name);
    const locked = lock.skills[name];
    if (locked) {
      const status = !disk.has(name)
        ? "missing" // was installed but dir was deleted; reinstall can fix
        : locked.contentHash !== entry.contentHash
          ? "outdated"
          : "installed";
      rows.push({
        name,
        status,
        publishedAt: entry.publishedAt,
        description: entry.description,
      });
    } else if (disk.has(name)) {
      // Dir exists but no install record (manually placed, or synced by postinstall/advisor or other channels)
      rows.push({
        name,
        status: "untracked",
        publishedAt: entry.publishedAt,
        description: entry.description,
      });
    } else {
      rows.push({
        name,
        status: "not-installed",
        publishedAt: entry.publishedAt,
        description: entry.description,
      });
    }
  }

  // In lock but delisted from remote: still usable locally (installed) or dir also gone (missing)
  for (const [name, locked] of Object.entries(lock.skills)) {
    if (seen.has(name)) continue;
    seen.add(name);
    rows.push({
      name,
      status: disk.has(name) ? "installed" : "missing",
      publishedAt: locked.publishedAt,
      description: locked.description,
    });
  }

  // On disk but in neither lock nor remote → untracked
  for (const name of diskNames) {
    if (!seen.has(name)) rows.push({ name, status: "untracked" });
  }

  return rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
