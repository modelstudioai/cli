export type { ConfigFile, Language, Region, Identity, Settings } from "./schema.ts";
export {
  BAILIAN_HOST,
  CONFIG_FILE_KEYS,
  API_KEY_CAPABILITY_PATTERN,
  DEFAULT_LANGUAGE,
  DOCS_HOSTS,
  REGIONS,
  SUPPORTED_LANGUAGES,
  isApiKeyCapability,
  normalizeApiKeyCapabilities,
  parseConfigFile,
} from "./schema.ts";
export { normalizeConfigName, readConfigFile, writeConfigFile } from "./loader.ts";
export {
  activateConfigProfile,
  validateConfigProfileActivation,
  readConfigProfiles,
  deleteConfigProfile,
  type ConfigProfiles,
} from "./loader.ts";
export {
  buildSources,
  buildSettings,
  selectApiKeyResolutionSources,
  type ApiKeyResolutionSourceSelection,
  type ResolutionSources,
} from "./loader.ts";
export { makeConfigStore, type ConfigStore } from "./store.ts";
export { ensureConfigDir, getConfigDir, getConfigPath, getCredentialsPath } from "./paths.ts";
export { getModelProfilePreset } from "./profile-presets.ts";
export { normalizeModelBaseUrl } from "./model-base-url.ts";
