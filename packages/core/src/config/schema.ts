import type { AuthMode } from "../auth/types.ts";

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
export type { AuthMode } from "../auth/types.ts";
export type CodingPlanRegion = "cn" | "intl";
export type TokenPlanRegion = "cn" | "intl";

export const AUTH_MODES = new Set<string>(["standard-api-key", "coding-plan", "token-plan"]);
export const CODING_PLAN_REGIONS = new Set<string>(["cn", "intl"]);
export const TOKEN_PLAN_REGIONS = new Set<string>(["cn", "intl"]);

export interface ConfigFile {
  api_key?: string;
  /** OAuth-style token from `bl auth login --console` callback; sent as `Authorization: Bearer …` */
  access_token?: string;
  active_auth_mode?: AuthMode;
  coding_plan_api_key?: string;
  coding_plan_region?: CodingPlanRegion;
  token_plan_api_key?: string;
  token_plan_region?: TokenPlanRegion;
  region?: Region;
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
  console_gateway_url?: string;
  telemetry?: boolean;
}

const VALID_REGIONS = new Set<string>(["cn", "us", "intl"]);
const VALID_OUTPUTS = new Set<string>(["text", "json"]);

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
  if (typeof obj.active_auth_mode === "string" && AUTH_MODES.has(obj.active_auth_mode))
    out.active_auth_mode = obj.active_auth_mode as AuthMode;
  if (typeof obj.coding_plan_api_key === "string" && obj.coding_plan_api_key.length > 0)
    out.coding_plan_api_key = obj.coding_plan_api_key;
  if (typeof obj.coding_plan_region === "string" && CODING_PLAN_REGIONS.has(obj.coding_plan_region))
    out.coding_plan_region = obj.coding_plan_region as CodingPlanRegion;
  if (typeof obj.token_plan_api_key === "string" && obj.token_plan_api_key.length > 0)
    out.token_plan_api_key = obj.token_plan_api_key;
  if (typeof obj.token_plan_region === "string" && TOKEN_PLAN_REGIONS.has(obj.token_plan_region))
    out.token_plan_region = obj.token_plan_region as TokenPlanRegion;
  if (typeof obj.region === "string" && VALID_REGIONS.has(obj.region))
    out.region = obj.region as Region;
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
  if (typeof obj.console_gateway_url === "string" && isHttpUrl(obj.console_gateway_url))
    out.console_gateway_url = obj.console_gateway_url;
  if (typeof obj.telemetry === "boolean") out.telemetry = obj.telemetry;

  return out;
}

export interface Config {
  clientName?: string;
  clientVersion?: string;
  activeAuthMode: AuthMode;
  apiKey?: string;
  /** `DASHSCOPE_ACCESS_TOKEN` env (explicit override). */
  accessTokenEnv?: string;
  /** `access_token` in config file (console login). */
  fileAccessToken?: string;
  fileApiKey?: string;
  codingPlanApiKey?: string;
  codingPlanRegion: CodingPlanRegion;
  tokenPlanApiKey?: string;
  tokenPlanRegion: TokenPlanRegion;
  fileRegion?: Region;
  configPath?: string;
  region: Region;
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
  consoleGatewayUrl: string;
  verbose: boolean;
  quiet: boolean;
  noColor: boolean;
  yes: boolean;
  dryRun: boolean;
  nonInteractive: boolean;
  async: boolean;
  telemetry: boolean;
}
