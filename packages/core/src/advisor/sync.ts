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
 * skills/index.json, one skill.tar.br per skill (brotli q6).
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
import { detectInstalledAgents, linkSkillToAgents } from "../skills/agents.ts";
import { installSkill } from "../skills/installer.ts";
import { readSkillLock, upsertSkillLockEntry } from "../skills/lock.ts";
import type { SkillIndexEntry } from "../skills/types.ts";

/** Public-read OSS skill registry root (hardcoded, does not use env). */
const REGISTRY_BASE_URL = "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/skills";
const WIKI_SKILL_NAME = "bailian-docs-llm-wiki";
const SKILL_DIR_NAME = "skills/bailian-docs-llm-wiki";
const STATE_FILE_NAME = "wiki-sync-state.json";
const MODELS_FILE = "models.jsonl";
const INDEX_KEY = "index.json";

const THROTTLE_MS = 12 * 60 * 60 * 1000; // 12h
const INDEX_TIMEOUT_MS = 3000;

interface SyncState {
  lastChecked: number;
  /** Content fingerprint of the last synced revision; the change-detection token */
  contentHash: string;
}

interface SkillsIndex {
  version: number;
  updatedAt?: string;
  skills: Record<string, SkillIndexEntry>;
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
function recordWikiInLock(entry: SkillIndexEntry, links: string[]): void {
  try {
    upsertSkillLockEntry(WIKI_SKILL_NAME, {
      ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
      ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
      installedAt: new Date().toISOString(),
      sourceType: "oss",
      ...(entry.description ? { description: entry.description } : {}),
      links,
    });
  } catch {
    /* Bookkeeping failure does not block sync; next sync or bl skill add will fill it in */
  }
}

/** Whether lock already has a wiki record matching the remote content fingerprint (avoids rewriting lock on every 12h check) */
function wikiLockUpToDate(contentHash: string): boolean {
  try {
    return readSkillLock().skills[WIKI_SKILL_NAME]?.contentHash === contentHash;
  } catch {
    return false;
  }
}

/** Fetch skills/index.json and extract the wiki skill entry; returns null on any failure */
async function fetchIndexEntry(): Promise<SkillIndexEntry | null> {
  try {
    const res = await fetch(`${REGISTRY_BASE_URL}/${INDEX_KEY}`, {
      signal: AbortSignal.timeout(INDEX_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const index = (await res.json()) as SkillsIndex;
    if (typeof index?.version !== "number" || !index.skills) return null;
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
    // Data and content are ready but lock record is missing/stale (e.g. postinstall landed before this mechanism) → backfill
    if (!wikiLockUpToDate(entry.contentHash)) recordWikiInLock(entry, []);
    return false;
  }

  // 4. Different content or missing data: delegate to the shared skill install pipeline
  //    (download → extract → SKILL.md validate → atomic swap → fan-out → lock with links)
  try {
    await installSkill(WIKI_SKILL_NAME, entry);
    const agents = detectInstalledAgents();
    const linkResults = linkSkillToAgents(WIKI_SKILL_NAME, agents);
    const effectiveLinks = linkResults
      .filter((link) => link.mode !== "skipped")
      .map((link) => link.path);
    recordWikiInLock(entry, effectiveLinks);
  } catch {
    // Install failed → clean exit, leave existing data untouched, do not write state; next recommend retries
    return false;
  }

  // 5. Success: write state
  writeState({ lastChecked: now, contentHash: entry.contentHash });
  return true;
}
