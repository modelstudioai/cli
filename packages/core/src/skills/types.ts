/**
 * Data structures for the unified skill publishing protocol (symmetric with FC publisher skills-publish.mjs).
 *
 * Remote layout (public-read OSS, the sole data source for `bl skill`):
 *   <registry>/index.json                       — skill catalog (SkillsIndex)
 *   <registry>/<name>/sha256-<hex>.tar.br       — content-addressed skill object (tar + brotli);
 *     entry.object names the exact file, so index.json is the single atomic commit point.
 *     Legacy fallback: <registry>/<name>/skill.tar.br (entries without object)
 *
 * Local layout:
 *   ~/.bailian/skills/<name>/           — canonical install directory
 *   ~/.bailian/skills/skill-lock.json   — installation fact records (SkillLockFile)
 */

/** A single skill entry in index.json */
export interface SkillIndexEntry {
  /** Reserved for the skill's own semantic version (x.y.z); not yet populated by the publisher */
  version?: string;
  /** Beijing-time publish timestamp; refreshed whenever content changes — the human-facing release marker */
  publishedAt?: string;
  /** Extracted by the publisher from README.md first paragraph or SKILL.md frontmatter */
  description?: string;
  /** Deterministic content fingerprint; the CLI uses this as the change-detection token (install/outdated) */
  contentHash?: string;
  /** Compression format identifier, currently always "tar.br" */
  compression?: string;
  /**
   * Content-addressed object file name under <registry>/<name>/, e.g. "sha256-<hex>.tar.br".
   * Absent on legacy entries — client falls back to the fixed key "skill.tar.br".
   */
  object?: string;
}

export interface SkillsIndex {
  updatedAt?: string;
  /** key = skill name (i.e. OSS directory name, download path, local install dir name) */
  skills: Record<string, SkillIndexEntry>;
}

/** Installation facts for a single skill in skill-lock.json */
export interface SkillLockEntry {
  /** Content fingerprint at install time; compared against the remote index to detect updates */
  contentHash?: string;
  /** Publish timestamp of the installed revision (for display) */
  publishedAt?: string;
  installedAt: string;
  /** Reserved: future support for github/gitlab and other sources */
  sourceType: "oss";
  description?: string;
  /** Fan-out link/copy paths to each agent; used for precise reclamation on remove */
  links?: string[];
}

export interface SkillLockFile {
  version: 1;
  skills: Record<string, SkillLockEntry>;
}

/**
 * Skill statuses for list:
 *   installed     — lock record exists, dir on disk, content fingerprint matches remote
 *   outdated      — lock record exists, dir on disk, remote content fingerprint differs
 *   not-installed — present in remote, absent locally
 *   missing       — lock record exists but dir was deleted (reinstall can fix)
 *   untracked     — dir on disk but no install record (manually placed or synced by other channels)
 */
export type SkillStatus = "installed" | "outdated" | "not-installed" | "missing" | "untracked";

export interface SkillStatusRow {
  name: string;
  status: SkillStatus;
  /** Publish timestamp of the remote revision (or local, for delisted skills) */
  publishedAt?: string;
  description?: string;
}
