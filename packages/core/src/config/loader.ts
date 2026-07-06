import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { parseConfigFile, type ConfigFile, type Settings } from "./schema.ts";
import { ensureConfigDir, getConfigPath } from "./paths.ts";
import { detectOutputFormat } from "../output/formatter.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { SourceFlags } from "../types/command.ts";

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

/**
 * 解析的三个来源,dispatch 边界一次构建。flags 收 Partial:ParsedFlags 里 switch 是
 * 必填 boolean,收 Partial 让 pipeline 等无 flag 场景传 {} 即可。
 */
export interface ResolutionSources {
  flags: Partial<SourceFlags>;
  file: ConfigFile;
  env: NodeJS.ProcessEnv;
}

export function buildSources(flags: Partial<SourceFlags>): ResolutionSources {
  return { flags, file: readConfigFile(), env: process.env };
}

/**
 * 纯解析 sources → Settings(命令唯一会读的配置面)。不含身份、baseUrl、鉴权。
 * 各字段链序 flag > env > file > 默认;锁定表 tests/config-priority.test.ts。
 */
export function buildSettings(s: ResolutionSources): Settings {
  const { flags, file, env } = s;

  const envTimeout = env.DASHSCOPE_TIMEOUT ? Number(env.DASHSCOPE_TIMEOUT) : undefined;
  const validEnvTimeout =
    envTimeout !== undefined && Number.isFinite(envTimeout) && envTimeout > 0
      ? envTimeout
      : undefined;
  const timeout = flags.timeout ?? validEnvTimeout ?? file.timeout ?? 300;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new BailianError("Timeout must be a positive finite number.", ExitCode.USAGE);
  }

  return {
    configPath: getConfigPath(),
    output: detectOutputFormat(flags.output || env.DASHSCOPE_OUTPUT || file.output),
    outputDir: file.output_dir || undefined,
    timeout,
    concurrent: flags.concurrent,
    defaultTextModel: file.default_text_model,
    defaultVideoModel: file.default_video_model,
    defaultImageModel: file.default_image_model,
    defaultSpeechModel: file.default_speech_model,
    defaultOmniModel: file.default_omni_model,
    workspaceId: flags.workspaceId || env.BAILIAN_WORKSPACE_ID || file.workspace_id || undefined,
    consoleRegion: flags.consoleRegion || file.console_region || undefined,
    consoleSite: (flags.consoleSite as Settings["consoleSite"]) || file.console_site || undefined,
    consoleSwitchAgent: flags.consoleSwitchAgent || file.console_switch_agent || undefined,
    verbose: flags.verbose || env.DASHSCOPE_VERBOSE === "1",
    quiet: flags.quiet || false,
    noColor: flags.noColor || env.NO_COLOR !== undefined || !process.stdout.isTTY,
    yes: flags.yes || false,
    dryRun: flags.dryRun || false,
    nonInteractive: flags.nonInteractive || false,
    async: flags.async || false,
    telemetry: env.DO_NOT_TRACK === "1" ? false : (file.telemetry ?? true),
  };
}
