/**
 * Runtime manifest schema and integrity verification (schema v2, real multi-source).
 *
 * The manifest describes real download sources for a pinned runtime: one CPython per platform (python-build-standalone
 * install_only tar.gz) + a single dashscope wheel shared across platforms (PyPI, py3-none-any). On first init the black box
 * downloads and verifies CPython per manifest, then pip --require-hashes installs dashscope and transitive deps from the bundled lockfile.
 * The manifest is a reviewed artifact shipped as a TS constant (manifest-data.ts, generated from the repo-root
 * runtime-manifest.json); SHA256 values come from official SHA256SUMS / PyPI, never invented.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { BailianError, UsageError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { BUNDLED_RUNTIME_MANIFEST_JSON } from "./manifest-data.ts";

/** Reviewed pinned dashscope version (upgrades require re-review + lockfile regeneration). */
export const RL_DASHSCOPE_VERSION = "1.25.23";

/** SHA256 of the dashscope==1.25.23 wheel (official PyPI value, verified). */
export const RL_DASHSCOPE_WHEEL_SHA256 =
  "7cb2cc48fd82536202e3100e93730e92c952435bb8cbe16d45de9700e1546bcc";

/** Reviewed pinned CPython version. */
export const RL_PYTHON_VERSION = "3.11.9";

/** Custom CPython mirror env var: replaces the GitHub release download prefix (1:1 path mapping, SHA unchanged). */
export const RL_PYTHON_MIRROR_ENV = "BAILIAN_RL_PYTHON_MIRROR";

/** Custom pip index env var: restricted regions can point at a stable PyPI mirror (Tsinghua tuna / Aliyun); a mirror lagging PyPI fails closed on missing pinned versions. */
export const RL_PIP_INDEX_ENV = "BAILIAN_RL_PIP_INDEX_URL";

/** python-build-standalone GitHub release download prefix (canonical reviewed source). */
const GITHUB_RELEASE_BASE =
  "https://github.com/astral-sh/python-build-standalone/releases/download/";

/** Built-in fallback mirror: Aliyun CNPM npmmirror, 1:1 with GitHub release paths, verified byte-identical. */
export const DEFAULT_PYTHON_MIRRORS = [
  "https://registry.npmmirror.com/-/binary/python-build-standalone/",
];

/** Per-platform CPython download entry. */
export interface IRuntimeManifestEntry {
  os: "darwin" | "linux";
  arch: string;
  /** python-build-standalone target triple (matches os/arch). */
  triple: string;
  pythonVersion: string;
  pythonUrl: string;
  pythonSha256: string;
}

/** Runtime manifest (schema v2). The dashscope wheel is shared across platforms and lives at the top level. */
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

/** Parse and validate manifest text; any malformed shape/hash is rejected (fail-closed). */
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

/** Bundled reviewed manifest (parsed from manifest-data.ts). */
export function bundledRuntimeManifest(): IRuntimeManifest {
  return parseRuntimeManifest(BUNDLED_RUNTIME_MANIFEST_JSON);
}

/** Select the platform entry by os/arch; undefined when nothing matches (caller fails closed). */
export function selectManifestEntry(
  manifest: IRuntimeManifest,
  platform: NodeJS.Platform,
  arch: string,
): IRuntimeManifestEntry | undefined {
  const os = platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : undefined;
  if (!os) return undefined;
  return manifest.entries.find((entry) => entry.os === os && entry.arch === arch);
}

/** Compute the byte SHA256 (hex). */
export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Rewrite a GitHub release download URL to a mirror prefix (prefix only; the <tag>/<file> suffix is unchanged). */
function rewriteToMirror(pythonUrl: string, mirrorBase: string): string | undefined {
  if (!pythonUrl.startsWith(GITHUB_RELEASE_BASE)) return undefined;
  const suffix = pythonUrl.slice(GITHUB_RELEASE_BASE.length);
  const base = mirrorBase.endsWith("/") ? mirrorBase : `${mirrorBase}/`;
  return base + suffix;
}

/**
 * Build CPython download candidates (ordered, deduplicated): custom mirror (if set) → canonical → built-in fallback mirror.
 * Switching sources changes only the origin, never the SHA256; the caller verifies integrity per source and moves on after any failure. Custom manifest URLs
 * that are not GitHub canonical are never mirror-rewritten; they download as-is.
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

/** Verify downloaded artifact integrity; reject immediately on mismatch (timing-safe comparison). */
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
