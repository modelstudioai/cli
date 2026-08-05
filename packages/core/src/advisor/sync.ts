/**
 * sync.ts — Wiki data sync (layer 2: triggered by recommend)
 *
 * Called via `maybeSyncWikiData()` during `bl advisor recommend`:
 *   1. 12h throttle: skip if last check was less than 12h ago
 *   2. Download skills/index.json from public-read OSS, compare bailian-docs-llm-wiki entry version
 *   3. Same version → only refresh lastChecked
 *   4. Different version → delegate to the shared skill install pipeline
 *      (installSkill: download + extract + SKILL.md validate + atomic swap;
 *       linkSkillToAgents: fan-out symlinks to detected agents;
 *       upsertSkillLockEntry: write lock WITH links so bl skill remove can reclaim correctly)
 *
 * Protocol: unified skill publishing protocol (FC publish-skills, all skills are isomorphic), entry point is
 * skills/index.json, one content-addressed object per skill (sha256-<hex>.tar.br, brotli q6;
 * legacy fallback skill.tar.br).
 *
 * Complements postinstall.js (layer 1, unconditional overwrite on npm install). Install, extraction,
 * validation, fan-out and lock writing all reuse the skills/ module (same as bl skill add), symmetric
 * with publisher tar.pack().
 *
 * Failure strategy: any step failure silently returns without updating lastChecked; next recommend retries immediately.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config/paths.ts";
import { detectInstalledAgents, fanOutSkillToAgents } from "../skills/agents.ts";
import { buildSkillLockEntry, installSkillWithFanout } from "../skills/installer.ts";
import { readSkillLock, upsertSkillLockEntry } from "../skills/lock.ts";
import { fetchSkillsIndex } from "../skills/registry.ts";
import type { SkillIndexEntry, SkillLockEntry } from "../skills/types.ts";

const WIKI_SKILL_NAME = "bailian-docs-llm-wiki";
const SKILL_DIR_NAME = "skills/bailian-docs-llm-wiki";
const STATE_FILE_NAME = "wiki-sync-state.json";
const MODELS_FILE = "models.jsonl";

const THROTTLE_MS = 12 * 60 * 60 * 1000; // 12h
/** Tighter than the interactive default: the silent channel must not stall `bl advisor recommend` */
const INDEX_TIMEOUT_MS = 3000;

interface SyncState {
  lastChecked: number;
  /** Content fingerprint of the last synced revision; the change-detection token */
  contentHash: string;
}

function getCatalogDir(): string {
  return join(getConfigDir(), SKILL_DIR_NAME);
}

/**
 * Whether local Wiki data is ready. Uses `models.jsonl` as the existence signal, consistent with
 * `CatalogSource.available()`: as long as the file advisor actually consumes exists,
 * the data is considered available.
 */
function catalogDataExists(): boolean {
  return existsSync(join(getCatalogDir(), "models", MODELS_FILE));
}

function getStatePath(): string {
  return join(getConfigDir(), STATE_FILE_NAME);
}

function readState(): SyncState | null {
  try {
    return JSON.parse(readFileSync(getStatePath(), "utf-8")) as SyncState;
  } catch {
    return null;
  }
}

function writeState(state: SyncState): void {
  try {
    writeFileSync(getStatePath(), JSON.stringify(state));
  } catch {
    /* Non-critical: if state write fails, next run will re-check */
  }
}

/**
 * Record this sync in skill-lock.json so the wiki skill shares the same ledger as bl skill
 * (list shows installed instead of untracked; update/remove can manage it correctly).
 * Includes fan-out links so bl skill remove can reclaim agent symlinks.
 * Bookkeeping in the silent channel must be best-effort: failure does not affect sync results.
 */
function recordWikiInLock(lockEntry: SkillLockEntry): void {
  try {
    upsertSkillLockEntry(WIKI_SKILL_NAME, lockEntry);
  } catch {
    /* Bookkeeping failure does not block sync; next sync or bl skill add will fill it in */
  }
}

/**
 * Whether the lock still needs a wiki backfill: content fingerprint mismatch, or the
 * record carries no fan-out links (postinstall writes contentHash only and never fans
 * out, so agents would otherwise never see the wiki skill until content changes).
 */
function wikiLockNeedsBackfill(contentHash: string): boolean {
  try {
    const locked = readSkillLock().skills[WIKI_SKILL_NAME];
    return locked?.contentHash !== contentHash || !Array.isArray(locked.links);
  } catch {
    return true;
  }
}

/** Fetch skills/index.json via the shared registry client and extract the wiki skill entry; returns null on any failure */
async function fetchIndexEntry(): Promise<SkillIndexEntry | null> {
  try {
    const index = await fetchSkillsIndex(INDEX_TIMEOUT_MS);
    return index.skills[WIKI_SKILL_NAME] ?? null;
  } catch {
    return null;
  }
}

/**
 * Check and sync Wiki data. Runs silently; never throws.
 * @returns Whether data was actually updated (for testing/debugging)
 */
export async function maybeSyncWikiData(): Promise<boolean> {
  const state = readState();
  const now = Date.now();

  // 1. throttle gate: only skip when "within the 12h window" AND "local data actually exists".
  //    If data is missing (user deleted manually, postinstall failed but state remains, etc.),
  //    ignore throttle and sync immediately to ensure advisor has data.
  if (state && now - state.lastChecked < THROTTLE_MS && catalogDataExists()) {
    return false;
  }

  // 2. Fetch skills/index.json and get the wiki entry
  const entry = await fetchIndexEntry();
  if (!entry?.contentHash) return false; // On failure, do not write lastChecked; retry next time

  // 3. Same content and local data exists: only refresh lastChecked, no re-download needed.
  //    Covers two cases: (a) state.contentHash === entry.contentHash → direct hit;
  //    (b) state missing but data intact (user or accident only deleted state) → write the fingerprint
  //    back to state, avoiding unnecessary download+extract.
  //    If data is missing or the fingerprint differs, falls through to step 4 for full download.
  const dataOk = catalogDataExists();
  if (dataOk && (!state || state.contentHash === entry.contentHash)) {
    writeState({ lastChecked: now, contentHash: entry.contentHash });
    // Lock record missing/stale (e.g. postinstall wrote canonical only, without fan-out) → backfill
    if (wikiLockNeedsBackfill(entry.contentHash)) {
      const previousLinks = readSkillLock().skills[WIKI_SKILL_NAME]?.links ?? [];
      const fanout = fanOutSkillToAgents(WIKI_SKILL_NAME, detectInstalledAgents(), previousLinks);
      recordWikiInLock(buildSkillLockEntry(entry, fanout.links));
    }
    return false;
  }

  // 4. Different content or missing data: delegate to the shared skill install pipeline
  //    (download → extract → SKILL.md validate → atomic swap → fan-out → lock with links)
  try {
    const previousLinks = readSkillLock().skills[WIKI_SKILL_NAME]?.links ?? [];
    const record = await installSkillWithFanout(
      WIKI_SKILL_NAME,
      entry,
      detectInstalledAgents(),
      previousLinks,
    );
    recordWikiInLock(record.lockEntry);
  } catch {
    // Install failed → clean exit, leave existing data untouched, do not write state; next recommend retries
    return false;
  }

  // 5. Success: write state
  writeState({ lastChecked: now, contentHash: entry.contentHash });
  return true;
}
