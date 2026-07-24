/**
 * End-user binary download base (OSS mirror).
 * GitHub Releases remain the publish source of truth; an external FC syncs assets here.
 * Production install.sh / install.ps1 are maintained outside this repo and read OSS only.
 *
 * Override with `BAILIAN_CLI_CDN`.
 */
export const DEFAULT_CLI_CDN_BASE = "https://bailian-cli.oss-cn-hangzhou.aliyuncs.com/bailian-cli";

/** GitHub Releases base — used when writing manifests attached to gh release assets. */
export const GITHUB_RELEASES_BASE = "https://github.com/modelstudioai/cli/releases";

export const DEFAULT_INSTALL_SCRIPT_URL = `${DEFAULT_CLI_CDN_BASE}/install.sh`;
export const DEFAULT_INSTALL_PS1_URL = `${DEFAULT_CLI_CDN_BASE}/install.ps1`;

export function getCliCdnBase(): string {
  const fromEnv = process.env.BAILIAN_CLI_CDN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return DEFAULT_CLI_CDN_BASE;
}

/**
 * Channel manifest on OSS (after FC sync): `{base}/channels/{channel}.json`
 * Formal installs still read `channels/latest.json` on OSS; this repo no longer
 * attaches `latest.json` to GitHub Releases (FC / ops maintain OSS latest).
 */
export function channelManifestUrl(channel = "latest"): string {
  return `${getCliCdnBase()}/channels/${channel}.json`;
}

export function releaseAssetUrl(version: string, fileName: string): string {
  return `${getCliCdnBase()}/releases/${version}/${fileName}`;
}

/** Platform triple used in asset names: `bl-<ver>-<os>-<arch>[.exe]`. */
export function detectBinaryPlatform(): { os: string; arch: string; fileSuffix: string } {
  const platform = process.platform;
  const arch = process.arch;

  let os: string;
  if (platform === "darwin") os = "darwin";
  else if (platform === "linux") os = "linux";
  else if (platform === "win32") os = "windows";
  else {
    throw new Error(`Unsupported platform for binary updates: ${platform}`);
  }

  let normalizedArch: string;
  if (arch === "arm64") normalizedArch = "arm64";
  else if (arch === "x64") normalizedArch = "x64";
  else {
    throw new Error(`Unsupported architecture for binary updates: ${arch}`);
  }

  if (os === "linux" && normalizedArch === "arm64") {
    throw new Error(
      "linux arm64 is not supported for binary updates; use: npm install -g bailian-cli",
    );
  }
  if (os === "windows" && normalizedArch === "arm64") {
    throw new Error(
      "windows arm64 is not supported for binary updates; use: npm install -g bailian-cli",
    );
  }

  const fileSuffix = platform === "win32" ? ".exe" : "";
  return { os, arch: normalizedArch, fileSuffix };
}

/** Release download asset: `bl-<ver>-<os>-<arch>.zip`. */
export function binaryAssetFileName(
  version: string,
  os: string,
  arch: string,
  _exe = false,
): string {
  return `bl-${version}-${os}-${arch}.zip`;
}

/** Uncompressed binary name inside the zip. */
export function binaryInnerFileName(
  version: string,
  os: string,
  arch: string,
  exe = false,
): string {
  return `bl-${version}-${os}-${arch}${exe ? ".exe" : ""}`;
}
