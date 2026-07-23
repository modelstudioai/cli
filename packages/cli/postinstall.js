/**
 * postinstall.js —— Wiki 数据同步（第一层：npm install 触发）
 *
 * npm/pnpm 装完 bailian-cli 后自动执行：无条件下载全量 Wiki 数据包并覆盖本地目录，
 * 保证用户首次使用 `bl advisor recommend` 时数据已就位。
 *
 * 流程：
 *   1. 从公共读 OSS 直链下载 manifest.json + wiki-doc-full.tar.br（~2.15MB）
 *   2. 校验 sha256
 *   3. Node 原生 brotli 解压 + tar-stream 解包到同盘临时目录
 *   4. renameSync 原子替换到 ~/.bailian/skills/bailian-docs-llm-wiki/
 *   5. 写 ~/.bailian/wiki-sync-state.json
 *
 * 设计约束：
 *   - 无条件覆盖：每次 install 都全量替换，不比对已有版本
 *   - 失败静默：任何一步失败 → console.warn → process.exit(0)，绝不阻塞安装
 *   - 独立实现：不 import bailian-cli-core，避免打包后 ESM 路径问题
 *   - 依赖 Node 原生模块 + tar-stream（与 sync.ts / Crawler oss-upload.mjs 一致）
 */
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
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

const OSS_BASE_URL = "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/bailian-docs-llm-wiki";
const CONFIG_DIR_NAME = ".bailian";
const SKILL_DIR_NAME = "skills/bailian-docs-llm-wiki";
const STATE_FILE_NAME = "wiki-sync-state.json";
const MANIFEST_KEY = "manifest.json";
const ASSET_KEY = "wiki-doc-full.tar.br";

const MANIFEST_TIMEOUT_MS = 3000;
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

/** brotli 解压 + tar-stream 解包到 destDir（与 Crawler tar.pack() 对称）。 */
async function extractTarBr(tarBrBuffer, destDir) {
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

/** 原子替换：tmpDir（同盘）→ catalogDir。 */
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
  // 1. 下载 manifest
  const manifest = await fetchJson(`${OSS_BASE_URL}/${MANIFEST_KEY}`, MANIFEST_TIMEOUT_MS);
  if (!manifest?.version) throw new Error("manifest 无 version");

  // 2. 下载 tar.br + 校验
  const tarBuf = await downloadBuffer(`${OSS_BASE_URL}/${ASSET_KEY}`);
  const sha256 = createHash("sha256").update(tarBuf).digest("hex");
  if (manifest.asset?.sha256 && sha256 !== manifest.asset.sha256) {
    throw new Error("sha256 校验失败");
  }

  // 3. 解包到同盘临时目录 + 原子替换
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

  // 4. 写 state
  try {
    writeFileSync(
      getStatePath(),
      JSON.stringify({ lastChecked: Date.now(), version: manifest.version }),
    );
  } catch {
    /* state 写失败不影响：首次 recommend 会重新检查 */
  }

  process.stdout.write(`bailian-cli: wiki 数据已就绪 (v${manifest.version})\n`);
}

main().catch((err) => {
  // 无条件放行：安装期网络/权限问题不应阻塞 npm install，
  // 首次 `bl advisor recommend` 时 sync.ts 会兜底同步。
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`bailian-cli: wiki 数据预下载跳过 (${msg})，首次使用时将自动同步。\n`);
  // Force a success exit code so a download failure never fails `npm install`.
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
});
