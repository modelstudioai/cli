/**
 * sync.ts —— Wiki 数据同步（第二层：recommend 触发）
 *
 * `bl advisor recommend` 执行时调用 `maybeSyncWikiData()`：
 *   1. 12h throttle：距上次检查不足 12h 直接跳过
 *   2. 从公共读 OSS 下载 manifest.json 比对版本
 *   3. 版本相同 → 仅刷新 lastChecked
 *   4. 版本不同 → 下载 tar.br → 校验 sha256 → brotli 解压 + tar-stream 解包
 *      到同盘临时目录 → renameSync 原子替换 → 写 state
 *
 * 与 postinstall.js（第一层，npm install 无条件覆盖）互补。二者都用
 * Node 原生 brotli + tar-stream extract()，与 Crawler 端 tar.pack() 对称。
 *
 * 失败策略：任何一步失败都静默返回且不更新 lastChecked，下次 recommend 立即重试。
 */
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import tar from "tar-stream";
import { getConfigDir } from "../config/paths.ts";

/** 公共读 OSS 目录，直链下载（硬编码，不走 env）。 */
const OSS_BASE_URL = "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/bailian-docs-llm-wiki";
const SKILL_DIR_NAME = "skills/bailian-docs-llm-wiki";
const STATE_FILE_NAME = "wiki-sync-state.json";
const MODELS_FILE = "models.jsonl";
const MANIFEST_KEY = "manifest.json";
const ASSET_KEY = "wiki-doc-full.tar.br";

const THROTTLE_MS = 12 * 60 * 60 * 1000; // 12h
const MANIFEST_TIMEOUT_MS = 3000;
const DOWNLOAD_TIMEOUT_MS = 30000;

interface SyncState {
  lastChecked: number;
  version: string;
}

interface Manifest {
  name: string;
  version: string;
  publishedAt?: string;
  asset: {
    name: string;
    url?: string;
    sha256: string;
    size: number;
    compression: string;
  };
}

function getCatalogDir(): string {
  return join(getConfigDir(), SKILL_DIR_NAME);
}

/**
 * 本地 Wiki 数据是否已就绪。以 `models.jsonl` 作为存在信号，与
 * `CatalogSource.available()` 判定一致：只要 advisor 真正消费的文件在，
 * 就认为数据可用。
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
    /* 非关键：state 写失败下次会重新检查 */
  }
}

async function fetchManifest(url: string): Promise<Manifest | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as Manifest;
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

/** brotli 解压 + tar-stream 解包到 destDir（与 Crawler tar.pack() 对称）。 */
async function extractTarBr(tarBrBuffer: Buffer, destDir: string): Promise<void> {
  const extract = tar.extract();

  extract.on("entry", (header, stream, next) => {
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

/**
 * 原子替换：把 tmpDir 解包好的内容替换到 catalogDir。
 * tmpDir 必须与 catalogDir 同盘（同一 parent 下），renameSync 才是原子的。
 */
function atomicSwap(tmpDir: string, catalogDir: string): void {
  mkdirSync(dirname(catalogDir), { recursive: true });
  const backup = `${catalogDir}.old-${Date.now()}`;
  if (existsSync(catalogDir)) renameSync(catalogDir, backup);
  try {
    renameSync(tmpDir, catalogDir);
  } catch (err) {
    // 替换失败 → 回滚旧目录，避免留下空洞
    if (existsSync(backup) && !existsSync(catalogDir)) renameSync(backup, catalogDir);
    throw err;
  }
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
}

/**
 * 检查并同步 Wiki 数据。静默执行，任何异常都不抛出。
 * @returns 是否实际更新了数据（用于测试/调试）
 */
export async function maybeSyncWikiData(): Promise<boolean> {
  const state = readState();
  const now = Date.now();

  // 1. throttle gate：仅当「在 12h 窗口内」且「本地数据确实存在」时才跳过。
  //    数据缺失（用户手动删除、postinstall 失败但 state 残留等）时无视 throttle，
  //    立即走同步补齐，避免 advisor 拿不到数据。
  if (state && now - state.lastChecked < THROTTLE_MS && catalogDataExists()) {
    return false;
  }

  // 2. 拉 manifest
  const manifest = await fetchManifest(`${OSS_BASE_URL}/${MANIFEST_KEY}`);
  if (!manifest?.version) return false; // 失败不写 lastChecked，下次重试

  // 3. 版本相同且本地数据存在：仅刷新 lastChecked，无需重新下载。
  //    覆盖两种状态：(a) state.version === manifest.version → 直接命中；
  //    (b) state 缺失但数据完好（用户或意外只删了 state）→ 用 manifest 版本
  //    写回 state，避免无谓的 2MB 下载+解压。
  //    数据缺失或版本落后时落到第 4 步全量下载补齐。
  const dataOk = catalogDataExists();
  if (dataOk && (!state || state.version === manifest.version)) {
    writeState({ lastChecked: now, version: manifest.version });
    return false;
  }

  // 4. 版本不同：下载 + 校验 + 解包 + 原子替换
  const tarBuf = await downloadBuffer(`${OSS_BASE_URL}/${ASSET_KEY}`);
  if (!tarBuf) return false;

  // sha256 校验
  const sha256 = createHash("sha256").update(tarBuf).digest("hex");
  if (manifest.asset?.sha256 && sha256 !== manifest.asset.sha256) return false;

  const catalogDir = getCatalogDir();
  // 同盘临时目录：extract 到这里再 rename，跨盘 rename 会 EXDEV
  const tmpDir = `${catalogDir}.tmp-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(tmpDir, { recursive: true });
    await extractTarBr(tarBuf, tmpDir);
    atomicSwap(tmpDir, catalogDir);
  } catch {
    // 解包/替换失败 → 清理临时目录，不动现有数据，不写 state
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    return false;
  }

  // 5. 成功：写 state
  writeState({ lastChecked: now, version: manifest.version });
  return true;
}
