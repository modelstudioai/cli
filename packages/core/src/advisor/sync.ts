/**
 * sync.ts — Wiki data sync (layer 2: triggered by recommend)
 *
 * Called via `maybeSyncWikiData()` during `bl advisor recommend`:
 *   1. 12h throttle: skip if last check was less than 12h ago
 *   2. Download skills/index.json from public-read OSS, compare bailian-docs-llm-wiki entry version
 *   3. Same version → only refresh lastChecked
 *   4. Different version → download skills/bailian-docs-llm-wiki/skill.tar.br → brotli decompress +
 *      tar-stream extract (per-entry path safety check) to same-volume temp dir → renameSync atomic swap
 *      → write state + skill-lock.json record (same ledger as bl skill add; list shows installed)
 *
 * Protocol: unified skill publishing protocol (FC publish-skills, all skills are isomorphic), entry point is
 * skills/index.json, one skill.tar.br per skill (brotli q6).
 *
 * Complements postinstall.js (layer 1, unconditional overwrite on npm install). Extraction and atomic swap
 * reuse skills/extract.ts (same as bl skill installer), symmetric with publisher tar.pack().
 *
 * Failure strategy: any step failure silently returns without updating lastChecked; next recommend retries immediately.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config/paths.ts";
import { atomicSwap, extractTarBr } from "../skills/extract.ts";
import { readSkillLock, upsertSkillLockEntry } from "../skills/lock.ts";

/** Public-read OSS skill registry root (hardcoded, does not use env). */
const REGISTRY_BASE_URL = "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/skills";
const WIKI_SKILL_NAME = "bailian-docs-llm-wiki";
const SKILL_DIR_NAME = "skills/bailian-docs-llm-wiki";
const STATE_FILE_NAME = "wiki-sync-state.json";
const MODELS_FILE = "models.jsonl";
const INDEX_KEY = "index.json";
const ASSET_NAME = "skill.tar.br";

const THROTTLE_MS = 12 * 60 * 60 * 1000; // 12h
const INDEX_TIMEOUT_MS = 3000;
const DOWNLOAD_TIMEOUT_MS = 30000;

interface SyncState {
  lastChecked: number;
  /** Content fingerprint of the last synced revision; the change-detection token */
  contentHash: string;
}

/** A single skill entry in skills/index.json (unified publishing protocol) */
interface IndexSkillEntry {
  /** Reserved for the skill's own semantic version; not used for change detection */
  version?: string;
  publishedAt?: string;
  description?: string;
  contentHash?: string;
  compression?: string;
}

interface SkillsIndex {
  version: number;
  updatedAt?: string;
  skills: Record<string, IndexSkillEntry>;
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
 * (list shows installed instead of untracked; update can manage subsequent upgrades).
 * Bookkeeping in the silent channel must be best-effort: failure does not affect sync results.
 */
function recordWikiInLock(entry: IndexSkillEntry): void {
  try {
    upsertSkillLockEntry(WIKI_SKILL_NAME, {
      ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
      ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
      installedAt: new Date().toISOString(),
      sourceType: "oss",
      ...(entry.description ? { description: entry.description } : {}),
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
async function fetchIndexEntry(): Promise<IndexSkillEntry | null> {
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

async function downloadBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
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
    if (!wikiLockUpToDate(entry.contentHash)) recordWikiInLock(entry);
    return false;
  }

  // 4. Different content: download + extract (with entry path safety check) + atomic swap
  const tarBuf = await downloadBuffer(`${REGISTRY_BASE_URL}/${WIKI_SKILL_NAME}/${ASSET_NAME}`);
  if (!tarBuf) return false;

  const catalogDir = getCatalogDir();
  // Same-volume temp dir: extract here then rename; cross-device rename would EXDEV
  const tmpDir = `${catalogDir}.tmp-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(tmpDir, { recursive: true });
    await extractTarBr(tarBuf, tmpDir);
    atomicSwap(tmpDir, catalogDir);
  } catch {
    // Extract/swap failed → clean up temp dir, leave existing data untouched, do not write state
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    return false;
  }

  // 5. Success: write state + skill-lock.json record (unified bl skill ledger)
  writeState({ lastChecked: now, contentHash: entry.contentHash });
  recordWikiInLock(entry);
  return true;
}
