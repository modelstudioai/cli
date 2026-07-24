export {
  detectInstallMethod,
  getInstallMethod,
  isCompiledBinary,
  writeInstallMethodSync,
  type InstallMethod,
} from "./method.ts";
export {
  DEFAULT_CLI_CDN_BASE,
  DEFAULT_INSTALL_PS1_URL,
  DEFAULT_INSTALL_SCRIPT_URL,
  GITHUB_RELEASES_BASE,
  binaryAssetFileName,
  binaryInnerFileName,
  channelManifestUrl,
  detectBinaryPlatform,
  getCliCdnBase,
  releaseAssetUrl,
} from "./cdn.ts";
export { extractZipEntryToFile } from "./unzip-asset.ts";
