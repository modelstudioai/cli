import { mkdir, rename, unlink, writeFile, chmod, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import {
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

function shareRoot(): string {
  if (process.env.BAILIAN_SHARE_DIR) return process.env.BAILIAN_SHARE_DIR;
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "bailian-cli");
  }
  return join(homedir(), ".local", "share", "bailian-cli");
}

function binRoot(): string {
  if (process.env.BAILIAN_BIN_DIR) return process.env.BAILIAN_BIN_DIR;
  if (process.platform === "win32") {
    return join(shareRoot(), "bin");
  }
  return join(homedir(), ".local", "bin");
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

/**
 * Download and install a newer standalone binary in place of the current install.
 * Assets are per-platform `.zip` files; checksum applies to the zip.
 * Returns the installed version string.
 */
export async function performBinaryUpdate(targetVersion: string): Promise<string> {
  const { os, arch, fileSuffix } = detectBinaryPlatform();
  const exe = fileSuffix === ".exe";
  const manifest = await fetchBinaryChannelManifest("latest");
  const assetKey = `${os}-${arch}`;
  const assetMeta = manifest?.assets?.[assetKey];
  const zipName = assetMeta?.file ?? binaryAssetFileName(targetVersion, os, arch, exe);
  const innerName = assetMeta?.inner ?? binaryInnerFileName(targetVersion, os, arch, exe);
  const expectedSha = assetMeta?.sha256;
  const url = assetMeta?.url ?? releaseAssetUrl(targetVersion, zipName);

  const tmpZip = join(shareRoot(), ".tmp", zipName);
  const buffer = await downloadToFile(url, tmpZip);
  const actualSha = sha256(buffer);
  if (expectedSha && expectedSha !== actualSha) {
    await unlink(tmpZip).catch(() => {});
    throw new Error(`Checksum mismatch for ${zipName}`);
  }

  const versionDir = join(shareRoot(), "versions", targetVersion);
  await mkdir(versionDir, { recursive: true });
  const binaryName = process.platform === "win32" ? "bl.exe" : "bl";
  const finalPath = join(versionDir, binaryName);
  const tmpBinary = join(shareRoot(), ".tmp", binaryName);
  await extractZipEntryToFile(tmpZip, tmpBinary, innerName);
  await unlink(tmpZip).catch(() => {});
  await rename(tmpBinary, finalPath);
  if (process.platform !== "win32") {
    await chmod(finalPath, 0o755);
  }

  const binDir = binRoot();
  await mkdir(binDir, { recursive: true });
  if (process.platform === "win32") {
    const installed = await readFile(finalPath);
    await writeFile(join(binDir, "bl.exe"), installed);
    await writeFile(join(binDir, "bailian.exe"), installed);
  } else {
    const { symlink } = await import("node:fs/promises");
    for (const name of ["bl", "bailian"] as const) {
      const linkPath = join(binDir, name);
      try {
        await unlink(linkPath);
      } catch {
        /* missing */
      }
      await symlink(finalPath, linkPath);
    }
  }

  writeInstallMethodSync("binary");
  await mkdir(getConfigDir(), { recursive: true });
  return targetVersion;
}
