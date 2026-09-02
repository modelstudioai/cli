import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { detectInstalledAgents, fanOutSkillToAgents, type AgentTarget } from "./agents.ts";
import { atomicSwap, computeDirContentHash, extractTarBr } from "./extract.ts";
import { getSkillsDir } from "./lock.ts";
import { downloadSkillAsset } from "./registry.ts";
import { isSafeSkillName } from "./sanitize.ts";
import { validateSkillDir, type SkillMeta } from "./validate.ts";
import type { SkillIndexEntry, SkillLockEntry } from "./types.ts";

/**
 * Skill installer: download → extract to tmpdir (with tar-slip check) → validate SKILL.md →
 * atomic swap into canonical. Canonical is only touched after all validations pass; on any failure
 * the current installation is preserved and temp artifacts are cleaned up in finally.
 */
export interface InstalledSkill {
  name: string;
  path: string;
  meta: SkillMeta;
}

function assertSafeName(name: string): void {
  if (!isSafeSkillName(name)) {
    throw new BailianError(
      `Invalid skill name: ${name}`,
      ExitCode.GENERAL,
      "Skill name contains path separators, traversal sequences, or other illegal characters; refusing to write to disk",
    );
  }
}

/** Install from an in-memory tar.br archive (the download-and-onwards half of installSkill; test-friendly) */
export async function installSkillFromBuffer(
  name: string,
  tarBrBuffer: Buffer,
  expectedContentHash?: string,
): Promise<InstalledSkill> {
  assertSafeName(name);
  const skillsDir = getSkillsDir();
  const dest = join(skillsDir, name);
  // Same-volume temp dir: extract here then rename; cross-device rename would EXDEV
  const tmpDir = join(skillsDir, `.tmp-${name}-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(tmpDir, { recursive: true });
    await extractTarBr(tarBrBuffer, tmpDir);
    // Integrity check before touching canonical: recompute the publisher fingerprint over
    // the extracted files; on mismatch the current installation is left untouched
    if (expectedContentHash?.startsWith("sha256:")) {
      const actualContentHash = computeDirContentHash(tmpDir);
      if (actualContentHash !== expectedContentHash) {
        throw new BailianError(
          `Skill ${name} failed integrity check: index says ${expectedContentHash}, archive is ${actualContentHash}`,
          ExitCode.GENERAL,
          "Downloaded archive does not match the index fingerprint (registry may be mid-publish); retry later",
        );
      }
    }
    const meta = validateSkillDir(tmpDir, name);
    atomicSwap(tmpDir, dest);
    return { name, path: dest, meta };
  } finally {
    // Best-effort cleanup: on failure paths this must not mask the original error,
    // and on success the dir is already renamed away (existsSync → false)
    try {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* leave the temp dir rather than hide the real error */
    }
  }
}

/** Install a single skill by index entry (download + validate + write to disk) */
export async function installSkill(
  name: string,
  entry: SkillIndexEntry,
  downloadAttempts?: number,
): Promise<InstalledSkill> {
  if (entry.compression && entry.compression !== "tar.br") {
    throw new BailianError(
      `Skill ${name} uses unsupported compression format: ${entry.compression}`,
      ExitCode.GENERAL,
      "Upgrade bailian-cli to the latest version and retry",
    );
  }
  const buffer = await downloadSkillAsset(name, entry, downloadAttempts);
  return installSkillFromBuffer(name, buffer, entry.contentHash);
}

/** Remove the skill directory under canonical; returns whether it was actually deleted (dir absent → false) */
export function removeSkillDir(name: string): boolean {
  assertSafeName(name);
  const dest = join(getSkillsDir(), name);
  if (!existsSync(dest)) return false;
  rmSync(dest, { recursive: true, force: true });
  return true;
}

/**
 * Build a skill-lock entry from an index entry + effective fan-out link paths.
 * Single source of truth for the "installation fact" shape shared by bl skill add/update,
 * advisor wiki sync, and any future install channel.
 */
export function buildSkillLockEntry(entry: SkillIndexEntry, links: string[]): SkillLockEntry {
  return {
    ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
    ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
    installedAt: new Date().toISOString(),
    sourceType: "oss",
    ...(entry.description ? { description: entry.description } : {}),
    links,
  };
}

export interface SkillInstallRecord {
  /** Ready-to-persist lock entry (links = effective fan-out paths) */
  lockEntry: SkillLockEntry;
  /** Ids of agents that actually received a link/copy (skipped ones excluded) */
  linkedAgents: string[];
}

/**
 * Full install workflow for one skill: install into canonical, fan out to agents, and build
 * the lock entry recording the merged links ledger. Callers decide how to persist the lock
 * entry (batch writeSkillLock for commands, best-effort upsertSkillLockEntry for silent channels).
 * recordedLinks = the skill's previously recorded fan-out paths from the lock; lets the
 * fan-out replace copy-fallback artifacts and keeps unvisited paths reclaimable.
 * downloadAttempts = registry fetch attempts (undefined → interactive default; silent
 * background channels pass 1 to fail fast instead of stalling the host command).
 */
export async function installSkillWithFanout(
  name: string,
  entry: SkillIndexEntry,
  agents: AgentTarget[] = detectInstalledAgents(),
  recordedLinks: string[] = [],
  downloadAttempts?: number,
): Promise<SkillInstallRecord> {
  await installSkill(name, entry, downloadAttempts);
  const fanout = fanOutSkillToAgents(name, agents, recordedLinks);
  return {
    lockEntry: buildSkillLockEntry(entry, fanout.links),
    linkedAgents: fanout.linkedAgents,
  };
}
