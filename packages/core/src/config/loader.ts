import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import {
  AUTH_MODES,
  CODING_PLAN_REGIONS,
  parseConfigFile,
  REGIONS,
  TOKEN_PLAN_REGIONS,
  type AuthMode,
  type CodingPlanRegion,
  type Config,
  type ConfigFile,
  type Region,
  type TokenPlanRegion,
} from "./schema.ts";
import { ensureConfigDir, getConfigPath } from "./paths.ts";
import { detectOutputFormat, type OutputFormat } from "../output/formatter.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { GlobalFlags } from "../types/flags.ts";

export function readConfigFile(): ConfigFile {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  try {
    return parseConfigFile(JSON.parse(readFileSync(path, "utf-8")));
  } catch (err) {
    const e = err as Error;
    if (e instanceof SyntaxError || e.message.includes("JSON")) {
      console.warn("Warning: config file is corrupted; using defaults.");
    }
    return {};
  }
}

export async function writeConfigFile(data: Record<string, unknown>): Promise<void> {
  await ensureConfigDir();
  const path = getConfigPath();
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

export function loadConfig(flags: GlobalFlags): Config {
  const file = readConfigFile();

  const apiKey = flags.apiKey || undefined;
  const fileApiKey = file.api_key;
  const accessTokenEnv = process.env.DASHSCOPE_ACCESS_TOKEN?.trim() || undefined;
  const fileAccessToken = file.access_token?.trim() || undefined;

  const envAuthMode = process.env.BAILIAN_AUTH_MODE;
  const activeAuthMode: AuthMode = apiKey
    ? "standard-api-key"
    : envAuthMode && AUTH_MODES.has(envAuthMode)
      ? (envAuthMode as AuthMode)
      : file.active_auth_mode || "standard-api-key";
  const envCodingPlanRegion = process.env.BAILIAN_CODING_PLAN_REGION;
  const codingPlanRegion: CodingPlanRegion =
    envCodingPlanRegion && CODING_PLAN_REGIONS.has(envCodingPlanRegion)
      ? (envCodingPlanRegion as CodingPlanRegion)
      : file.coding_plan_region || "cn";
  const envTokenPlanRegion = process.env.BAILIAN_TOKEN_PLAN_REGION;
  const tokenPlanRegion: TokenPlanRegion =
    envTokenPlanRegion && TOKEN_PLAN_REGIONS.has(envTokenPlanRegion)
      ? (envTokenPlanRegion as TokenPlanRegion)
      : file.token_plan_region || "cn";

  const explicitRegion = (flags.region as string) || process.env.DASHSCOPE_REGION || undefined;
  const cachedRegion = file.region;
  const region = (explicitRegion || cachedRegion || "cn") as Region;

  const baseUrl =
    flags.baseUrl ||
    process.env.DASHSCOPE_BASE_URL ||
    file.base_url ||
    REGIONS[region] ||
    REGIONS.cn;

  const output: OutputFormat = detectOutputFormat(
    flags.output || process.env.DASHSCOPE_OUTPUT || file.output,
  );

  const envTimeout = process.env.DASHSCOPE_TIMEOUT
    ? Number(process.env.DASHSCOPE_TIMEOUT)
    : undefined;
  const validEnvTimeout =
    envTimeout !== undefined && Number.isFinite(envTimeout) && envTimeout > 0
      ? envTimeout
      : undefined;
  const timeout = flags.timeout ?? validEnvTimeout ?? file.timeout ?? 300;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new BailianError("Timeout must be a positive finite number.", ExitCode.USAGE);
  }

  return {
    activeAuthMode,
    apiKey,
    accessTokenEnv,
    fileAccessToken,
    fileApiKey,
    codingPlanApiKey: file.coding_plan_api_key || process.env.BAILIAN_CODING_PLAN_API_KEY,
    codingPlanRegion,
    tokenPlanApiKey: file.token_plan_api_key || process.env.BAILIAN_TOKEN_PLAN_API_KEY,
    tokenPlanRegion,
    fileRegion: file.region,
    configPath: getConfigPath(),
    region,
    baseUrl,
    output,
    outputDir: file.output_dir || undefined,
    timeout,
    defaultTextModel: file.default_text_model,
    defaultVideoModel: file.default_video_model,
    defaultImageModel: file.default_image_model,
    defaultSpeechModel: file.default_speech_model,
    defaultOmniModel: file.default_omni_model,
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || file.access_key_id || undefined,
    accessKeySecret:
      process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || file.access_key_secret || undefined,
    workspaceId: process.env.BAILIAN_WORKSPACE_ID || file.workspace_id || undefined,
    consoleGatewayUrl:
      process.env.BAILIAN_CONSOLE_GATEWAY_URL ||
      file.console_gateway_url ||
      "https://pre-bailian-cs.console.aliyun.com",
    verbose: flags.verbose || process.env.DASHSCOPE_VERBOSE === "1",
    quiet: flags.quiet || false,
    noColor: flags.noColor || process.env.NO_COLOR !== undefined || !process.stdout.isTTY,
    yes: flags.yes || false,
    dryRun: flags.dryRun || false,
    nonInteractive: flags.nonInteractive || false,
    async: flags.async || false,
    telemetry: process.env.DO_NOT_TRACK === "1" ? false : (file.telemetry ?? true),
  };
}
