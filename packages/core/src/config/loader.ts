import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { parseConfigFile, REGIONS, type Config, type ConfigFile } from "./schema.ts";
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

  const baseUrl = flags.baseUrl || file.base_url || process.env.DASHSCOPE_BASE_URL || REGIONS.cn;

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
    apiKey,
    accessTokenEnv,
    fileAccessToken,
    fileApiKey,
    configPath: getConfigPath(),
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
    consoleSite: (flags.consoleSite as Config["consoleSite"]) || file.console_site || undefined,
    consoleRegion: (flags.consoleRegion as string) || file.console_region || undefined,
    consoleSwitchAgent:
      (flags.consoleSwitchAgent as number) || file.console_switch_agent || undefined,
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
