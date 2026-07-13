import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { CONFIG_FILE_KEYS, parseConfigFile, type ConfigFile, type Settings } from "./schema.ts";
import { ensureConfigDir, getConfigPath } from "./paths.ts";
import { detectOutputFormat } from "../output/formatter.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { SourceFlags } from "../types/command.ts";

const CONFIG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * 校验并规范化 `--config <name>`：`undefined`/""/"default" 都视为未指定（等价顶层默认配置）。
 * 合法命名只允许字母、数字、`-`/`_`，且不能与 `ConfigFile` 顶层字段同名（避免写入时与默认配置字段歧义）。
 */
export function normalizeConfigName(name?: unknown): string | undefined {
  if (name === undefined || name === "" || name === "default") return undefined;
  if (typeof name !== "string" || !CONFIG_NAME_PATTERN.test(name)) {
    const display = typeof name === "string" ? name : JSON.stringify(name);
    throw new BailianError(
      `Invalid config name "${display}".`,
      ExitCode.USAGE,
      "Use letters, numbers, '-' or '_', starting with a letter or number.",
    );
  }
  if ((CONFIG_FILE_KEYS as readonly string[]).includes(name)) {
    throw new BailianError(
      `Invalid config name "${name}". It conflicts with a config key.`,
      ExitCode.USAGE,
    );
  }
  return name;
}

/** 读完整 config.json 原始对象（不经过 `parseConfigFile` 过滤），保留其他命名配置 block。 */
function readRawConfigObject(): Record<string, unknown> {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  } catch (err) {
    const e = err as Error;
    if (e instanceof SyntaxError || e.message.includes("JSON")) {
      console.warn("Warning: config file is corrupted; using defaults.");
    }
    return {};
  }
}

function readRawConfigBlock(raw: Record<string, unknown>, configName?: string): unknown {
  if (!configName) return raw;
  const block = raw[configName];
  return block && typeof block === "object" && !Array.isArray(block) ? block : {};
}

export function readConfigFile(configName?: string): ConfigFile {
  const raw = readRawConfigObject();
  return parseConfigFile(readRawConfigBlock(raw, configName));
}

export async function writeConfigFile(
  data: Record<string, unknown>,
  configName?: string,
): Promise<void> {
  const raw = readRawConfigObject();
  if (configName) {
    raw[configName] = data;
  } else {
    for (const key of Object.keys(raw)) {
      if ((CONFIG_FILE_KEYS as readonly string[]).includes(key)) delete raw[key];
    }
    Object.assign(raw, data);
  }
  await ensureConfigDir();
  const path = getConfigPath();
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(raw, null, 2) + "\n", { mode: 0o600 });
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
  /** 当前命名配置名(`--config <name>` 解析后);未指定或 `default` 时为 undefined。 */
  configName?: string;
  /** 实际 config.json 路径(不受 configName 影响,一直是同一个文件)。 */
  configPath?: string;
}

export function buildSources(flags: Partial<SourceFlags>): ResolutionSources {
  const configName = normalizeConfigName(flags.config);
  return {
    flags,
    file: readConfigFile(configName),
    env: process.env,
    configName,
    configPath: getConfigPath(),
  };
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
    configPath: s.configPath ?? getConfigPath(),
    configName: s.configName,
    intentDetectBaseUrl:
      file.intent_detect_base_url || env.DASHSCOPE_INTENT_DETECT_BASE_URL || undefined,
    output: detectOutputFormat(flags.output || env.DASHSCOPE_OUTPUT || file.output),
    outputExplicit: Boolean(flags.output || env.DASHSCOPE_OUTPUT || file.output),
    outputDir: file.output_dir || undefined,
    timeout,
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
    dryRun: flags.dryRun || false,
    telemetry: env.DO_NOT_TRACK === "1" ? false : (file.telemetry ?? true),
  };
}
