/**
 * 运行时清单 schema 与完整性校验（schema v2，真实多源）。
 *
 * 清单描述固定版本运行时的真实下载源：每平台一份 CPython（python-build-standalone
 * install_only tar.gz）+ 全平台共用一个 dashscope wheel（PyPI，py3-none-any）。黑盒
 * 首次初始化按清单下载并校验 CPython，再按随包锁文件 pip --require-hashes 装
 * dashscope 及传递依赖。清单是审查产物，以 TS 常量随包携带（manifest-data.ts，由
 * 仓库根 runtime-manifest.json 生成）；SHA256 取自官方 SHA256SUMS / PyPI，非臆造。
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { BailianError, UsageError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { BUNDLED_RUNTIME_MANIFEST_JSON } from "./manifest-data.ts";

/** 受审查的固定 dashscope 版本（升级须重新审查 + 重生成锁文件）。 */
export const RL_DASHSCOPE_VERSION = "1.25.23";

/** dashscope==1.25.23 wheel 的 SHA256（PyPI 官方，已核验）。 */
export const RL_DASHSCOPE_WHEEL_SHA256 =
  "7cb2cc48fd82536202e3100e93730e92c952435bb8cbe16d45de9700e1546bcc";

/** 受审查的固定 CPython 版本。 */
export const RL_PYTHON_VERSION = "3.11.9";

/** 自定义 CPython 镜像环境变量：替换 GitHub release 下载前缀（路径 1:1 映射，SHA 不变）。 */
export const RL_PYTHON_MIRROR_ENV = "BAILIAN_RL_PYTHON_MIRROR";

/** 自定义 pip 索引环境变量：受限地区可指向稳定 PyPI 镜像（清华 tuna / 阿里 aliyun）；镜像滞后 PyPI 时缺钉版会 fail-closed。 */
export const RL_PIP_INDEX_ENV = "BAILIAN_RL_PIP_INDEX_URL";

/** python-build-standalone GitHub release 下载前缀（canonical 受审查源）。 */
const GITHUB_RELEASE_BASE =
  "https://github.com/astral-sh/python-build-standalone/releases/download/";

/** 内置回退镜像：阿里 CNPM npmmirror，与 GitHub release 路径 1:1，已核验字节级一致。 */
export const DEFAULT_PYTHON_MIRRORS = [
  "https://registry.npmmirror.com/-/binary/python-build-standalone/",
];

/** 单平台 CPython 下载条目。 */
export interface IRuntimeManifestEntry {
  os: "darwin" | "linux";
  arch: string;
  /** python-build-standalone 目标 triple（与 os/arch 对应）。 */
  triple: string;
  pythonVersion: string;
  pythonUrl: string;
  pythonSha256: string;
}

/** 运行时清单（schema v2）。dashscope wheel 全平台共用，置于顶层。 */
export interface IRuntimeManifest {
  schemaVersion: 2;
  dashscopeVersion: string;
  dashscopeUrl: string;
  dashscopeSha256: string;
  entries: IRuntimeManifestEntry[];
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

function requireString(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new UsageError(`Invalid runtime manifest: ${where}.${key} must be a non-empty string.`);
  }
  return value;
}

function requireSha256(record: Record<string, unknown>, key: string, where: string): string {
  const value = requireString(record, key, where);
  if (!SHA256_HEX.test(value)) {
    throw new UsageError(`Invalid runtime manifest: ${where}.${key} must be a 64-char hex SHA256.`);
  }
  return value;
}

/** 解析并校验清单文本；任何形状/哈希非法都拒绝（fail-closed）。 */
export function parseRuntimeManifest(text: string): IRuntimeManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new UsageError("Invalid runtime manifest: not valid JSON.", String(error));
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new UsageError("Invalid runtime manifest: root must be an object.");
  }
  const root = raw as Record<string, unknown>;
  if (root.schemaVersion !== 2) {
    throw new UsageError("Invalid runtime manifest: schemaVersion must be 2.");
  }
  const dashscopeVersion = requireString(root, "dashscopeVersion", "root");
  const dashscopeUrl = requireString(root, "dashscopeUrl", "root");
  const dashscopeSha256 = requireSha256(root, "dashscopeSha256", "root");
  if (!Array.isArray(root.entries) || root.entries.length === 0) {
    throw new UsageError("Invalid runtime manifest: entries must be a non-empty array.");
  }
  const entries: IRuntimeManifestEntry[] = root.entries.map((item, index) => {
    const where = `entries[${index}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new UsageError(`Invalid runtime manifest: ${where} must be an object.`);
    }
    const record = item as Record<string, unknown>;
    const os = requireString(record, "os", where);
    if (os !== "darwin" && os !== "linux") {
      throw new UsageError(`Invalid runtime manifest: ${where}.os must be darwin or linux.`);
    }
    return {
      os,
      arch: requireString(record, "arch", where),
      triple: requireString(record, "triple", where),
      pythonVersion: requireString(record, "pythonVersion", where),
      pythonUrl: requireString(record, "pythonUrl", where),
      pythonSha256: requireSha256(record, "pythonSha256", where),
    };
  });
  return { schemaVersion: 2, dashscopeVersion, dashscopeUrl, dashscopeSha256, entries };
}

/** 随包携带的受审查清单（解析自 manifest-data.ts）。 */
export function bundledRuntimeManifest(): IRuntimeManifest {
  return parseRuntimeManifest(BUNDLED_RUNTIME_MANIFEST_JSON);
}

/** 按 os/arch 选择平台条目；无匹配返回 undefined（调用方 fail-closed）。 */
export function selectManifestEntry(
  manifest: IRuntimeManifest,
  platform: NodeJS.Platform,
  arch: string,
): IRuntimeManifestEntry | undefined {
  const os = platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : undefined;
  if (!os) return undefined;
  return manifest.entries.find((entry) => entry.os === os && entry.arch === arch);
}

/** 计算字节 SHA256（hex）。 */
export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 把 GitHub release 下载 URL 重写为镜像前缀（仅换前缀，<tag>/<file> 后缀不变）。 */
function rewriteToMirror(pythonUrl: string, mirrorBase: string): string | undefined {
  if (!pythonUrl.startsWith(GITHUB_RELEASE_BASE)) return undefined;
  const suffix = pythonUrl.slice(GITHUB_RELEASE_BASE.length);
  const base = mirrorBase.endsWith("/") ? mirrorBase : `${mirrorBase}/`;
  return base + suffix;
}

/**
 * 构造 CPython 下载候选源（有序去重）：自定义镜像（若设置）→ canonical → 内置回退镜像。
 * 换源只换来源、SHA256 不变；调用方逐源校验完整性，任一源失败转下一源。非 GitHub
 * canonical 的自定义清单 URL 不做镜像重写，仅原样下载。
 */
export function pythonDownloadCandidates(
  pythonUrl: string,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const candidates: string[] = [];
  const customMirror = env[RL_PYTHON_MIRROR_ENV];
  if (customMirror) {
    const rewritten = rewriteToMirror(pythonUrl, customMirror);
    if (rewritten) candidates.push(rewritten);
  }
  candidates.push(pythonUrl);
  for (const mirror of DEFAULT_PYTHON_MIRRORS) {
    const rewritten = rewriteToMirror(pythonUrl, mirror);
    if (rewritten) candidates.push(rewritten);
  }
  return [...new Set(candidates)];
}

/** 校验下载产物完整性；不匹配立即拒绝（timing-safe 比较）。 */
export function assertArtifactIntegrity(data: Buffer, expectedSha256: string): void {
  const actual = sha256Hex(data);
  const expectedBuffer = Buffer.from(expectedSha256, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new BailianError(
      "Runtime artifact integrity check failed (SHA256 mismatch).",
      ExitCode.GENERAL,
      "The downloaded artifact does not match the reviewed manifest. Refusing to install. No cloud resources were created.",
    );
  }
}
