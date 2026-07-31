import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readlink,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import {
  BINARY_PRODUCT_CLIENT_NAME,
  binaryAssetFileName,
  binaryInnerFileName,
  channelManifestUrl,
  detectBinaryPlatform,
  extractZipEntryToFile,
  getConfigDir,
  releaseAssetUrl,
  writeInstallMethodSync,
} from "bailian-cli-core";

export interface ChannelManifest {
  version: string;
  assets?: Record<string, { file?: string; sha256?: string; url?: string; inner?: string }>;
}

/** Product share root: versions/, current, and (on Windows) bin/. */
export function getBinaryShareRoot(): string {
  if (process.env.BAILIAN_SHARE_DIR) return process.env.BAILIAN_SHARE_DIR;
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "bailian-cli");
  }
  return join(homedir(), ".local", "share", "bailian-cli");
}

/** PATH directory that should expose `bl` / `bailian`. */
export function getBinaryBinRoot(): string {
  if (process.env.BAILIAN_BIN_DIR) return process.env.BAILIAN_BIN_DIR;
  if (process.platform === "win32") {
    return join(getBinaryShareRoot(), "bin");
  }
  return join(homedir(), ".local", "bin");
}

export function getBinaryVersionsDir(): string {
  return join(getBinaryShareRoot(), "versions");
}

export function getBinaryCurrentPath(): string {
  return join(getBinaryShareRoot(), "current");
}

export async function fetchBinaryChannelVersion(
  channel = "latest",
  timeoutMs = 5000,
): Promise<string | null> {
  try {
    const response = await fetch(channelManifestUrl(channel), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as ChannelManifest;
    return data.version ?? null;
  } catch {
    return null;
  }
}

export async function fetchBinaryChannelManifest(
  channel = "latest",
  timeoutMs = 8000,
): Promise<ChannelManifest | null> {
  try {
    const response = await fetch(channelManifestUrl(channel), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as ChannelManifest;
  } catch {
    return null;
  }
}

/** Strip a leading `v` from release-style tags (`v1.2.3` → `1.2.3`). */
export function normalizeBinaryVersion(raw: string): string {
  const trimmed = raw.trim();
  if (/^v\d/i.test(trimmed)) return trimmed.slice(1);
  return trimmed;
}

async function fetchSha256FromVersionSums(
  version: string,
  fileName: string,
  timeoutMs = 8000,
): Promise<string | undefined> {
  try {
    const response = await fetch(releaseAssetUrl(version, "SHA256SUMS"), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return undefined;
    const text = await response.text();
    for (const line of text.split("\n")) {
      const match = line.trim().match(/^([a-fA-F0-9]{64})\s+(\S+)$/);
      if (match?.[2] === fileName) return match[1].toLowerCase();
    }
  } catch {
    /* optional checksum source */
  }
  return undefined;
}

export interface BinaryDownloadSpec {
  zipName: string;
  innerName: string;
  url: string;
  expectedSha?: string;
}

/**
 * Resolve download URL / names for an exact binary version.
 * Always targets `v{version}/` assets; never reuses another version's rolling
 * manifest `url` / `file`. Checksum prefers per-version SHA256SUMS, then the
 * latest rolling manifest only when it points at the same version.
 */
export async function resolveBinaryDownloadSpec(
  targetVersion: string,
): Promise<BinaryDownloadSpec> {
  const version = normalizeBinaryVersion(targetVersion);
  const { os, arch, fileSuffix } = detectBinaryPlatform();
  const exe = fileSuffix === ".exe";
  const zipName = binaryAssetFileName(version, os, arch, exe);
  const innerName = binaryInnerFileName(version, os, arch, exe);
  const url = releaseAssetUrl(version, zipName);

  let expectedSha = await fetchSha256FromVersionSums(version, zipName);
  if (!expectedSha) {
    const manifest = await fetchBinaryChannelManifest("latest");
    if (manifest?.version === version) {
      expectedSha = manifest.assets?.[`${os}-${arch}`]?.sha256;
    }
  }

  return { zipName, innerName, url, expectedSha };
}

async function downloadToFile(url: string, dest: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
  return buffer;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function binaryFileName(): string {
  return process.platform === "win32" ? "bl.exe" : "bl";
}

function aliasFileName(): string {
  return process.platform === "win32" ? "bailian.exe" : "bailian";
}

/** Resolve which version directory `current` points at, if any. */
export async function readCurrentVersionDir(): Promise<string | null> {
  const currentPath = getBinaryCurrentPath();
  try {
    const target = await readlink(currentPath);
    return target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)
      ? target
      : join(dirname(currentPath), target);
  } catch {
    return null;
  }
}

function versionNameFromDir(versionDir: string): string | null {
  const versionsRoot = getBinaryVersionsDir();
  const normalizedDir = versionDir.replaceAll("\\", "/");
  const normalizedRoot = versionsRoot.replaceAll("\\", "/").replace(/\/$/, "");
  if (!normalizedDir.startsWith(`${normalizedRoot}/`) && normalizedDir !== normalizedRoot) {
    // Also accept basename match when paths differ by symlink resolution
    const base = versionDir.replaceAll("\\", "/").split("/").pop();
    return base && base !== "versions" ? base : null;
  }
  return normalizedDir.slice(normalizedRoot.length + 1).split("/")[0] ?? null;
}

/**
 * Point `shareRoot/current` at `versions/<version>/`.
 * Unix: directory symlink. Windows: directory junction.
 * Retargets in place so PATH entries that go through `current` keep working.
 */
export async function switchCurrentToVersion(version: string): Promise<string> {
  const versionDir = join(getBinaryVersionsDir(), version);
  const currentPath = getBinaryCurrentPath();
  await mkdir(getBinaryShareRoot(), { recursive: true });

  try {
    await unlink(currentPath);
  } catch {
    try {
      await rm(currentPath, { recursive: true, force: true });
    } catch {
      /* missing */
    }
  }

  const { symlink } = await import("node:fs/promises");
  if (process.platform === "win32") {
    await symlink(versionDir, currentPath, "junction");
  } else {
    await symlink(versionDir, currentPath);
  }
  return versionDir;
}

/**
 * Ensure PATH bin entries resolve through `current` (Codex-style).
 * - Unix: `~/.local/bin/{bl,bailian}` → `current/bl`
 * - Windows: `shareRoot/bin` is a junction → `current` (contains bl.exe + bailian.exe)
 */
export async function ensureBinaryPathEntries(version: string): Promise<void> {
  const versionDir = join(getBinaryVersionsDir(), version);
  const binaryName = binaryFileName();
  const currentBinary = join(getBinaryCurrentPath(), binaryName);
  const binDir = getBinaryBinRoot();

  if (process.platform === "win32") {
    await ensureWindowsBinJunction(binDir);
    // Version dir must expose both aliases for the bin junction to work.
    const primary = join(versionDir, binaryName);
    const aliasPath = join(versionDir, aliasFileName());
    try {
      await lstat(aliasPath);
    } catch {
      try {
        const { link } = await import("node:fs/promises");
        await link(primary, aliasPath);
      } catch {
        await copyFile(primary, aliasPath);
      }
    }
    return;
  }

  await mkdir(binDir, { recursive: true });
  const { symlink } = await import("node:fs/promises");
  for (const name of ["bl", "bailian"] as const) {
    const linkPath = join(binDir, name);
    try {
      await unlink(linkPath);
    } catch {
      /* missing */
    }
    await symlink(currentBinary, linkPath);
  }
}

async function ensureWindowsBinJunction(binDir: string): Promise<void> {
  const currentPath = getBinaryCurrentPath();
  const { symlink } = await import("node:fs/promises");

  try {
    const stats = await lstat(binDir);
    if (stats.isSymbolicLink()) {
      const target = await readlink(binDir);
      const resolved =
        target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)
          ? target
          : join(dirname(binDir), target);
      if (
        resolved.replaceAll("\\", "/").toLowerCase() ===
        currentPath.replaceAll("\\", "/").toLowerCase()
      ) {
        return;
      }
      await unlink(binDir);
      await symlink(currentPath, binDir, "junction");
      return;
    }
    // Real directory from older installs: replace with junction to current.
    // May fail if a running exe inside bin is locked — surface a clear error.
    await rm(binDir, { recursive: true, force: true });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code && code !== "ENOENT") {
      throw new Error(
        `Failed to migrate ${binDir} to a junction pointing at current (${code}). ` +
          `Close other bl sessions and re-run update, or re-run the install script once.`,
        { cause: error },
      );
    }
  }

  await mkdir(dirname(binDir), { recursive: true });
  await symlink(currentPath, binDir, "junction");
}

/**
 * Keep only the listed version directory names under `versions/`.
 * Always preserves directories that are still the live `current` target.
 */
export async function pruneBinaryVersions(keepVersions: string[]): Promise<void> {
  const versionsDir = getBinaryVersionsDir();
  const keep = new Set(keepVersions.filter(Boolean));
  const currentDir = await readCurrentVersionDir();
  const currentName = currentDir ? versionNameFromDir(currentDir) : null;
  if (currentName) keep.add(currentName);

  let entries: string[];
  try {
    entries = await readdir(versionsDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith(".")) {
      await rm(join(versionsDir, entry), { recursive: true, force: true }).catch(() => {});
      continue;
    }
    if (keep.has(entry)) continue;
    await rm(join(versionsDir, entry), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Download and install a newer standalone binary using Codex-style layout:
 * `versions/<ver>/` + retarget `current` + path entries through `current`.
 * After a successful switch, prune so only current + previous version remain.
 *
 * Does not overwrite a running executable image: old version files stay locked
 * by the current process; the next invocation follows the updated pointer.
 */
export async function performBinaryUpdate(targetVersion: string): Promise<string> {
  const version = normalizeBinaryVersion(targetVersion);
  const { zipName, innerName, url, expectedSha } = await resolveBinaryDownloadSpec(version);

  const share = getBinaryShareRoot();
  const versionsDir = getBinaryVersionsDir();
  await mkdir(join(share, ".tmp"), { recursive: true });
  await mkdir(versionsDir, { recursive: true });

  const previousVersionDir = await readCurrentVersionDir();
  const previousVersion = previousVersionDir ? versionNameFromDir(previousVersionDir) : null;

  const tmpZip = join(share, ".tmp", zipName);
  const buffer = await downloadToFile(url, tmpZip);
  const actualSha = sha256(buffer);
  if (expectedSha && expectedSha !== actualSha) {
    await unlink(tmpZip).catch(() => {});
    throw new Error(`Checksum mismatch for ${zipName}`);
  }

  const stagingDir = join(versionsDir, `.staging.${version}.${process.pid}`);
  await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(stagingDir, { recursive: true });

  const binaryName = binaryFileName();
  const stagingBinary = join(stagingDir, binaryName);
  const tmpBinary = join(share, ".tmp", `${binaryName}.${process.pid}`);
  await extractZipEntryToFile(tmpZip, tmpBinary, innerName);
  await unlink(tmpZip).catch(() => {});
  await rename(tmpBinary, stagingBinary);
  if (process.platform !== "win32") {
    await chmod(stagingBinary, 0o755);
  } else {
    const aliasPath = join(stagingDir, aliasFileName());
    try {
      const { link } = await import("node:fs/promises");
      await link(stagingBinary, aliasPath);
    } catch {
      await copyFile(stagingBinary, aliasPath);
    }
  }

  const versionDir = join(versionsDir, version);
  await rm(versionDir, { recursive: true, force: true }).catch(() => {});
  await rename(stagingDir, versionDir);

  await switchCurrentToVersion(version);
  await ensureBinaryPathEntries(version);

  const keep = [version];
  if (previousVersion && previousVersion !== version) {
    keep.push(previousVersion);
  }
  await pruneBinaryVersions(keep);

  writeInstallMethodSync("binary", { clientName: BINARY_PRODUCT_CLIENT_NAME });
  await mkdir(getConfigDir(), { recursive: true });
  return version;
}
