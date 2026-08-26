import { normalizeModelBaseUrl } from "./model-base-url.ts";

export const REGIONS = {
  cn: "https://dashscope.aliyuncs.com",
  us: "https://dashscope-us.aliyuncs.com",
  intl: "https://dashscope-intl.aliyuncs.com",
} as const;

export const DOCS_HOSTS = {
  cn: "https://help.aliyun.com/zh/model-studio",
  us: "https://help.aliyun.com/zh/model-studio",
  intl: "https://help.aliyun.com/zh/model-studio",
} as const;

export const BAILIAN_HOST = "https://bailian.cn-beijing.aliyuncs.com";

export type Region = keyof typeof REGIONS;

export const SUPPORTED_LANGUAGES = ["en-US", "zh-CN"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "en-US";

export interface ConfigFile {
  language?: Language;
  api_key?: string;
  /** OAuth-style token from `bl auth login --console` callback; sent as `Authorization: Bearer …` */
  access_token?: string;
  /** Alibaba Cloud OpenAPI AccessKey ID from `bl auth login --open-api`. */
  access_key_id?: string;
  /** Alibaba Cloud OpenAPI AccessKey secret from `bl auth login --open-api`. */
  access_key_secret?: string;
  /** Alibaba Cloud STS Security Token (optional, for temporary credentials). */
  security_token?: string;
  base_url?: string;
  output?: "text" | "json";
  output_dir?: string;
  timeout?: number;
  default_text_model?: string;
  default_video_model?: string;
  default_image_to_video_model?: string;
  default_reference_to_video_model?: string;
  default_image_model?: string;
  default_speech_model?: string;
  default_speech_recognition_model?: string;
  default_omni_model?: string;
  /** Leaf API-key capabilities this named Profile endpoint can serve. */
  api_key_capabilities?: string[];
  workspace_id?: string;
  console_site?: "domestic" | "international";
  console_region?: string;
  console_switch_agent?: number;
  telemetry?: boolean;
}

export const CONFIG_FILE_KEYS = [
  "language",
  "api_key",
  "access_token",
  "access_key_id",
  "access_key_secret",
  "security_token",
  "base_url",
  "output",
  "output_dir",
  "timeout",
  "default_text_model",
  "default_video_model",
  "default_image_to_video_model",
  "default_reference_to_video_model",
  "default_image_model",
  "default_speech_model",
  "default_speech_recognition_model",
  "default_omni_model",
  "api_key_capabilities",
  "workspace_id",
  "console_site",
  "console_region",
  "console_switch_agent",
  "telemetry",
] as const satisfies readonly (keyof ConfigFile)[];

const VALID_OUTPUTS = new Set<string>(["text", "json"]);
const VALID_CONSOLE_SITES = new Set<string>(["domestic", "international"]);
export const API_KEY_CAPABILITY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function isApiKeyCapability(value: string): boolean {
  return API_KEY_CAPABILITY_PATTERN.test(value);
}

/**
 * Normalize a persisted capability allowlist. Absence keeps the policy disabled;
 * a present malformed value fails closed to an empty allowlist.
 */
export function normalizeApiKeyCapabilities(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];

  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return [];
    const capability = item.trim();
    if (!isApiKeyCapability(capability)) return [];
    if (!normalized.includes(capability)) normalized.push(capability);
  }
  return normalized;
}

/**
 * A syntactically valid absolute http(s) URL. Used to validate `base_url`
 * from the config file: the credential-bearing client
 * sends the Bearer token to these origins, so a bare `startsWith("http")` check
 * (which also accepts e.g. "httpfoo://…") is too loose.
 */
function parseModelBaseUrl(value: string): string | undefined {
  try {
    return normalizeModelBaseUrl(value);
  } catch {
    return undefined;
  }
}

export function parseConfigFile(raw: unknown): ConfigFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: ConfigFile = {};

  if (
    typeof obj.language === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(obj.language)
  )
    out.language = obj.language as Language;
  if (typeof obj.api_key === "string") out.api_key = obj.api_key;
  if (typeof obj.access_token === "string" && obj.access_token.length > 0)
    out.access_token = obj.access_token;
  else if (typeof obj.accessToken === "string" && obj.accessToken.length > 0)
    out.access_token = obj.accessToken;
  if (typeof obj.access_key_id === "string" && obj.access_key_id.length > 0)
    out.access_key_id = obj.access_key_id;
  else if (typeof obj.openapi_access_key_id === "string" && obj.openapi_access_key_id.length > 0)
    out.access_key_id = obj.openapi_access_key_id;
  if (typeof obj.access_key_secret === "string" && obj.access_key_secret.length > 0)
    out.access_key_secret = obj.access_key_secret;
  else if (
    typeof obj.openapi_access_key_secret === "string" &&
    obj.openapi_access_key_secret.length > 0
  )
    out.access_key_secret = obj.openapi_access_key_secret;
  if (typeof obj.security_token === "string" && obj.security_token.length > 0)
    out.security_token = obj.security_token;
  if (typeof obj.base_url === "string") {
    const baseUrl = parseModelBaseUrl(obj.base_url);
    if (baseUrl) out.base_url = baseUrl;
  }
  if (typeof obj.output === "string" && VALID_OUTPUTS.has(obj.output))
    out.output = obj.output as ConfigFile["output"];
  if (typeof obj.output_dir === "string" && obj.output_dir.length > 0)
    out.output_dir = obj.output_dir;
  if (typeof obj.timeout === "number" && obj.timeout > 0) out.timeout = obj.timeout;
  if (typeof obj.default_text_model === "string" && obj.default_text_model.length > 0)
    out.default_text_model = obj.default_text_model;
  if (typeof obj.default_video_model === "string" && obj.default_video_model.length > 0)
    out.default_video_model = obj.default_video_model;
  if (
    typeof obj.default_image_to_video_model === "string" &&
    obj.default_image_to_video_model.length > 0
  )
    out.default_image_to_video_model = obj.default_image_to_video_model;
  if (
    typeof obj.default_reference_to_video_model === "string" &&
    obj.default_reference_to_video_model.length > 0
  )
    out.default_reference_to_video_model = obj.default_reference_to_video_model;
  if (typeof obj.default_image_model === "string" && obj.default_image_model.length > 0)
    out.default_image_model = obj.default_image_model;
  if (typeof obj.default_speech_model === "string" && obj.default_speech_model.length > 0)
    out.default_speech_model = obj.default_speech_model;
  if (
    typeof obj.default_speech_recognition_model === "string" &&
    obj.default_speech_recognition_model.length > 0
  )
    out.default_speech_recognition_model = obj.default_speech_recognition_model;
  if (typeof obj.default_omni_model === "string" && obj.default_omni_model.length > 0)
    out.default_omni_model = obj.default_omni_model;
  const apiKeyCapabilities = normalizeApiKeyCapabilities(obj.api_key_capabilities);
  if (apiKeyCapabilities !== undefined) out.api_key_capabilities = apiKeyCapabilities;
  if (typeof obj.workspace_id === "string" && obj.workspace_id.length > 0)
    out.workspace_id = obj.workspace_id;
  if (typeof obj.console_site === "string" && VALID_CONSOLE_SITES.has(obj.console_site))
    out.console_site = obj.console_site as ConfigFile["console_site"];
  if (typeof obj.console_region === "string" && obj.console_region.length > 0)
    out.console_region = obj.console_region;
  if (typeof obj.console_switch_agent === "number" && obj.console_switch_agent > 0)
    out.console_switch_agent = obj.console_switch_agent;
  if (typeof obj.telemetry === "boolean") out.telemetry = obj.telemetry;

  return out;
}

/** 静态产品身份,createCli 注入一次(bl/rag 各异,故注入而非模块常量)。 */
export interface Identity {
  /** Product binary name, e.g. "bl", "rag". */
  binName: string;
  version: string;
  /** npm package name for self-update, e.g. "bailian-cli". */
  npmPackage: string;
  /** User-Agent / telemetry client name. */
  clientName: string;
}

/**
 * 命令唯一会读的配置面(flag/env/file 解析后的有效值)。
 * 不含身份(Identity)、不含秘密(credential);console 三元组为 dry-run 展示保留,
 * 真实调用走 ConsoleCredential(同链解析,受控重叠)。
 */
export interface Settings {
  configPath?: string;
  configName?: string;
  output: "text" | "json";
  /**
   * Whether `output` came from an explicit source (flag/env/file) rather than
   * the default. Commands whose default format differs from the global default
   * (e.g. `advisor recommend` defaults to json) branch on this.
   */
  outputExplicit: boolean;
  outputDir?: string;
  timeout: number;
  defaultTextModel?: string;
  defaultVideoModel?: string;
  defaultImageToVideoModel?: string;
  defaultReferenceToVideoModel?: string;
  defaultImageModel?: string;
  defaultSpeechModel?: string;
  defaultSpeechRecognitionModel?: string;
  defaultOmniModel?: string;
  workspaceId?: string;
  consoleRegion?: string;
  consoleSite?: "domestic" | "international";
  consoleSwitchAgent?: number;
  verbose: boolean;
  quiet: boolean;
  dryRun: boolean;
  telemetry: boolean;
}
