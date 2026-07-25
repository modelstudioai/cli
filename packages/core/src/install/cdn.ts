/**
 * End-user binary download base (OSS). CI publishes release assets and rolling
 * channel manifests here directly (tools/release/lib/oss-direct-upload.mjs);
 * no external FC is involved.
 *
 * Layout under the base:
 *   v<version>/<asset>.zip —— immutable per-version binaries + SHA256SUMS
 *   manifest.json          —— stable pointer { latest, releasedAt, assets }
 *   latest.json            —— stable rolling manifest (os-arch keyed, sha256)
 *   <channel>.json         —— per-channel rolling manifests (beta versions)
 *
 * Override with `BAILIAN_CLI_CDN`.
 */
export const DEFAULT_CLI_CDN_BASE = "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/release";

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
 * Rolling channel manifest at the CDN base root: `{base}/{channel}.json`.
 * `latest.json` (stable) and `<channel>.json` (betas) share the same shape;
 * both are written by CI on publish.
 */
export function channelManifestUrl(channel = "latest"): string {
  return `${getCliCdnBase()}/${channel}.json`;
}

/** Immutable per-version asset: `{base}/v{version}/{fileName}`. */
export function releaseAssetUrl(version: string, fileName: string): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `${getCliCdnBase()}/${tag}/${fileName}`;
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
