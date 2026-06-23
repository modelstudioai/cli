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

export interface ConfigFile {
  api_key?: string;
  /** OAuth-style token from `bl auth login --console` callback; sent as `Authorization: Bearer …` */
  access_token?: string;
  base_url?: string;
  output?: "text" | "json";
  output_dir?: string;
  timeout?: number;
  default_text_model?: string;
  default_video_model?: string;
  default_image_model?: string;
  default_speech_model?: string;
  default_omni_model?: string;
  access_key_id?: string;
  access_key_secret?: string;
  workspace_id?: string;
  console_site?: "domestic" | "international";
  console_region?: string;
  console_switch_agent?: number;
  telemetry?: boolean;
}

const VALID_OUTPUTS = new Set<string>(["text", "json"]);
const VALID_CONSOLE_SITES = new Set<string>(["domestic", "international"]);

/**
 * A syntactically valid absolute http(s) URL. Used to validate `base_url`
 * from the config file: the credential-bearing client
 * sends the Bearer token to these origins, so a bare `startsWith("http")` check
 * (which also accepts e.g. "httpfoo://…") is too loose.
 */
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseConfigFile(raw: unknown): ConfigFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: ConfigFile = {};

  if (typeof obj.api_key === "string") out.api_key = obj.api_key;
  if (typeof obj.access_token === "string" && obj.access_token.length > 0)
    out.access_token = obj.access_token;
  else if (typeof obj.accessToken === "string" && obj.accessToken.length > 0)
    out.access_token = obj.accessToken;
  if (typeof obj.base_url === "string" && isHttpUrl(obj.base_url)) out.base_url = obj.base_url;
  if (typeof obj.output === "string" && VALID_OUTPUTS.has(obj.output))
    out.output = obj.output as ConfigFile["output"];
  if (typeof obj.output_dir === "string" && obj.output_dir.length > 0)
    out.output_dir = obj.output_dir;
  if (typeof obj.timeout === "number" && obj.timeout > 0) out.timeout = obj.timeout;
  if (typeof obj.default_text_model === "string" && obj.default_text_model.length > 0)
    out.default_text_model = obj.default_text_model;
  if (typeof obj.default_video_model === "string" && obj.default_video_model.length > 0)
    out.default_video_model = obj.default_video_model;
  if (typeof obj.default_image_model === "string" && obj.default_image_model.length > 0)
    out.default_image_model = obj.default_image_model;
  if (typeof obj.default_speech_model === "string" && obj.default_speech_model.length > 0)
    out.default_speech_model = obj.default_speech_model;
  if (typeof obj.default_omni_model === "string" && obj.default_omni_model.length > 0)
    out.default_omni_model = obj.default_omni_model;
  if (typeof obj.access_key_id === "string" && obj.access_key_id.length > 0)
    out.access_key_id = obj.access_key_id;
  if (typeof obj.access_key_secret === "string" && obj.access_key_secret.length > 0)
    out.access_key_secret = obj.access_key_secret;
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

export interface Config {
  clientName?: string;
  clientVersion?: string;
  /** Product binary name (e.g. "bl", "rag"), injected by createCli for command-facing output. */
  binName?: string;
  /** npm package name for self-update (e.g. "bailian-cli", "bailian-cli-rag"), injected by createCli. */
  npmPackage?: string;
  apiKey?: string;
  /** `DASHSCOPE_ACCESS_TOKEN` env (explicit override). */
  accessTokenEnv?: string;
  /** `access_token` in config file (console login). */
  fileAccessToken?: string;
  fileApiKey?: string;
  configPath?: string;
  baseUrl: string;
  output: "text" | "json";
  outputDir?: string;
  timeout: number;
  defaultTextModel?: string;
  defaultVideoModel?: string;
  defaultImageModel?: string;
  defaultSpeechModel?: string;
  defaultOmniModel?: string;
  accessKeyId?: string;
  accessKeySecret?: string;
  workspaceId?: string;
  consoleSite?: "domestic" | "international";
  consoleRegion?: string;
  consoleSwitchAgent?: number;
  verbose: boolean;
  quiet: boolean;
  noColor: boolean;
  yes: boolean;
  dryRun: boolean;
  nonInteractive: boolean;
  async: boolean;
  telemetry: boolean;
}
