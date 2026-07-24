/**
 * postinstall.js — Wiki data sync (layer 1: triggered by npm install)
 *
 * Runs automatically after npm/pnpm installs bailian-cli: unconditionally downloads the full Wiki data
 * package and overwrites the local directory, ensuring data is in place the first time the user runs
 * `bl advisor recommend`.
 *
 * Flow (unified skill publishing protocol: skills/index.json + one skill.tar.br per skill):
 *   1. Download skills/index.json from public-read OSS, get the bailian-docs-llm-wiki entry
 *   2. Download skills/bailian-docs-llm-wiki/skill.tar.br (brotli q6, ~2.3MB)
 *   3. Node built-in brotli decompress + tar-stream extract (per-entry path safety check) to same-volume temp dir
 *   4. renameSync atomic swap into ~/.bailian/skills/bailian-docs-llm-wiki/
 *   5. Write ~/.bailian/wiki-sync-state.json
 *   6. Write ~/.bailian/skills/skill-lock.json record (same ledger as bl skill)
 *
 * Design constraints:
 *   - Unconditional overwrite: every install fully replaces, no version comparison
 *   - Silent failure: any step failure → console.warn → process.exit(0), never blocks install
 *   - Standalone implementation: does not import bailian-cli-core, avoiding ESM path issues after bundling
 *   - Depends on Node built-in modules + tar-stream (consistent with sync.ts / publisher skills-publish.mjs)
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import tar from "tar-stream";

const REGISTRY_BASE_URL = "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/skills";
const WIKI_SKILL_NAME = "bailian-docs-llm-wiki";
const CONFIG_DIR_NAME = ".bailian";
const SKILL_DIR_NAME = "skills/bailian-docs-llm-wiki";
const STATE_FILE_NAME = "wiki-sync-state.json";
const INDEX_KEY = "index.json";
const ASSET_NAME = "skill.tar.br";

const INDEX_TIMEOUT_MS = 3000;
const DOWNLOAD_TIMEOUT_MS = 30000;

function getConfigDir() {
  if (process.env.BAILIAN_CONFIG_DIR) return process.env.BAILIAN_CONFIG_DIR;
  return join(homedir(), CONFIG_DIR_NAME);
}

function getCatalogDir() {
  return join(getConfigDir(), SKILL_DIR_NAME);
}

function getStatePath() {
  return join(getConfigDir(), STATE_FILE_NAME);
}

function getSkillLockPath() {
  return join(getConfigDir(), "skills", "skill-lock.json");
}

/**
 * Record this sync in skill-lock.json (same ledger as bl skill; list shows installed).
 * Semantics aligned with upsertSkillLockEntry in core/src/skills/lock.ts: shallow-merge with the existing
 * entry, preserving fields like links written by bl skill add; rebuild as empty table if lock is corrupted/unrecognized.
 * best-effort: failure does not affect data sync results.
 */
function upsertSkillLock(name, entry) {
  try {
    let lock = { version: 1, skills: {} };
    try {
      const parsed = JSON.parse(readFileSync(getSkillLockPath(), "utf-8"));
      if (parsed?.version === 1 && parsed.skills && typeof parsed.skills === "object") {
        lock = parsed;
      }
    } catch {
      /* absent/corrupted → empty table */
    }
    lock.skills[name] = { ...lock.skills[name], ...entry };
    mkdirSync(dirname(getSkillLockPath()), { recursive: true });
    writeFileSync(getSkillLockPath(), JSON.stringify(lock, null, 2) + "\n");
  } catch {
    /* Bookkeeping failure does not block install; advisor-side sync will backfill */
  }
}

async function fetchJson(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function downloadBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** tar 条目路径必须是相对路径且不含 ..，防止 tar-slip 逃逸解包目录 */
function isSafeEntryName(name) {
  if (name.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(name)) return false;
  return !name.split("/").includes("..");
}

/** Brotli decompress + tar-stream extract into destDir (symmetric with publisher tar.pack()). */
async function extractTarBr(tarBrBuffer, destDir) {
  const extract = tar.extract();

  extract.on("entry", (header, stream, next) => {
    if (!isSafeEntryName(header.name)) {
      next(new Error(`unsafe tar entry: ${header.name}`));
      return;
    }
    const filePath = join(destDir, header.name);
    if (header.type === "directory") {
      mkdirSync(filePath, { recursive: true });
      stream.resume();
      stream.on("end", next);
      return;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    const ws = createWriteStream(filePath);
    stream.pipe(ws);
    ws.on("finish", next);
    ws.on("error", next);
  });

  await pipeline(Readable.from(tarBrBuffer), createBrotliDecompress(), extract);
}

/** Atomic swap: tmpDir (same volume) → catalogDir. */
function atomicSwap(tmpDir, catalogDir) {
  mkdirSync(dirname(catalogDir), { recursive: true });
  const backup = `${catalogDir}.old-${Date.now()}`;
  if (existsSync(catalogDir)) renameSync(catalogDir, backup);
  try {
    renameSync(tmpDir, catalogDir);
  } catch (err) {
    if (existsSync(backup) && !existsSync(catalogDir)) renameSync(backup, catalogDir);
    throw err;
  }
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
}

async function main() {
  // 1. Download skills/index.json and get the wiki entry
  const index = await fetchJson(`${REGISTRY_BASE_URL}/${INDEX_KEY}`, INDEX_TIMEOUT_MS);
  const entry = index?.skills?.[WIKI_SKILL_NAME];
  if (!entry?.contentHash)
    throw new Error("no bailian-docs-llm-wiki entry (or contentHash) in index.json");

  // 2. Download skill.tar.br (per-entry path safety check during extraction)
  const tarBuf = await downloadBuffer(`${REGISTRY_BASE_URL}/${WIKI_SKILL_NAME}/${ASSET_NAME}`);

  // 3. Extract to same-volume temp dir + atomic swap
  const catalogDir = getCatalogDir();
  const tmpDir = `${catalogDir}.tmp-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(tmpDir, { recursive: true });
    await extractTarBr(tarBuf, tmpDir);
    atomicSwap(tmpDir, catalogDir);
  } catch (err) {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }

  // 4. Write state
  try {
    writeFileSync(
      getStatePath(),
      JSON.stringify({ lastChecked: Date.now(), contentHash: entry.contentHash }),
    );
  } catch {
    /* state write failure has no impact: first recommend will re-check */
  }

  // 5. skill-lock.json record: wiki shares the same ledger as bl skill
  upsertSkillLock(WIKI_SKILL_NAME, {
    contentHash: entry.contentHash,
    ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
    installedAt: new Date().toISOString(),
    sourceType: "oss",
    ...(entry.description ? { description: entry.description } : {}),
  });

  process.stdout.write(`bailian-cli: wiki data ready (${entry.publishedAt ?? "latest"})\n`);
}

main().catch((err) => {
  // Unconditional pass-through: install-time network/permission issues should not block npm install;
  // sync.ts will fall back to syncing on the first `bl advisor recommend`.
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(
    `bailian-cli: wiki data pre-download skipped (${msg}); will sync automatically on first use.\n`,
  );
  // Force a success exit code so a download failure never fails `npm install`.
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
});
