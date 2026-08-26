import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { CONFIG_FILE_KEYS, parseConfigFile, type ConfigFile, type Settings } from "./schema.ts";
import { ensureConfigDir, getConfigPath } from "./paths.ts";
import { detectOutputFormat } from "../output/formatter.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { SourceFlags } from "../types/command.ts";

const CONFIG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ACTIVE_CONFIG_KEY = "active_config";

function isConfigBlock(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

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
  if ((CONFIG_FILE_KEYS as readonly string[]).includes(name) || name === ACTIVE_CONFIG_KEY) {
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

/** 读取顶层激活元数据；按需校验命名 Profile 必须实际存在。 */
function readStoredActiveConfigName(
  raw: Record<string, unknown>,
  requireExisting: boolean,
): string | undefined {
  const activeConfigName = normalizeConfigName(raw[ACTIVE_CONFIG_KEY]);
  if (activeConfigName && requireExisting && !isConfigBlock(raw[activeConfigName])) {
    throw new BailianError(
      `Active config "${activeConfigName}" does not exist.`,
      ExitCode.USAGE,
      "Use --config default to select the default config, then activate an existing profile.",
    );
  }
  return activeConfigName;
}

function readRawConfigBlock(raw: Record<string, unknown>, configName?: string): unknown {
  if (!configName) return raw;
  const block = raw[configName];
  return isConfigBlock(block) ? block : {};
}

export function readConfigFile(configName?: string): ConfigFile {
  const raw = readRawConfigObject();
  return parseConfigFile(readRawConfigBlock(raw, configName));
}

/** 写入所选 Profile；登录流程可在同一次原子写入中将显式 Profile 设为激活项。 */
export async function writeConfigFile(
  data: Record<string, unknown>,
  configName?: string,
  options: { activate?: boolean } = {},
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
  if (options.activate) {
    raw[ACTIVE_CONFIG_KEY] = configName ?? "default";
  }
  await writeRawConfigObject(raw);
}

async function writeRawConfigObject(raw: Record<string, unknown>): Promise<void> {
  await ensureConfigDir();
  const path = getConfigPath();
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(raw, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

/** 全量配置快照：顶层默认配置 + 各命名 profile。 */
export interface ConfigProfiles {
  /** 顶层默认配置（parseConfigFile 过滤后）。 */
  default: ConfigFile;
  /** 命名配置 name -> 配置。 */
  named: Record<string, ConfigFile>;
  /** 当前持久化激活项；default 表示顶层配置。 */
  active: string;
}

/**
 * 读取全部 profile：顶层默认配置与各命名 block。
 * 命名 block = raw 中不属于 `CONFIG_FILE_KEYS`、且值为普通对象的项。
 */
export function readConfigProfiles(): ConfigProfiles {
  const raw = readRawConfigObject();
  const named: Record<string, ConfigFile> = {};
  for (const [key, value] of Object.entries(raw)) {
    if ((CONFIG_FILE_KEYS as readonly string[]).includes(key) || key === ACTIVE_CONFIG_KEY)
      continue;
    if (isConfigBlock(value)) {
      named[key] = parseConfigFile(value);
    }
  }
  return {
    default: parseConfigFile(raw),
    named,
    active: readStoredActiveConfigName(raw, true) ?? "default",
  };
}

function resolveConfigProfileActivation(raw: Record<string, unknown>, name?: unknown): string {
  const configName = normalizeConfigName(name);
  if (configName && !isConfigBlock(raw[configName])) {
    throw new BailianError(
      `Config "${configName}" does not exist.`,
      ExitCode.USAGE,
      "Create or log in to the profile before activating it.",
    );
  }
  return configName ?? "default";
}

/** 校验激活目标并返回规范化展示名；不写配置。 */
export function validateConfigProfileActivation(name?: unknown): string {
  return resolveConfigProfileActivation(readRawConfigObject(), name);
}

/** 将已存在的命名 Profile（或 default）设为持久化激活项。 */
export async function activateConfigProfile(name?: unknown): Promise<string> {
  const raw = readRawConfigObject();
  const active = resolveConfigProfileActivation(raw, name);
  raw[ACTIVE_CONFIG_KEY] = active;
  await writeRawConfigObject(raw);
  return active;
}

/** 删除一个命名 profile block；存在才删并回写，返回是否有变更。 */
export async function deleteConfigProfile(name?: unknown): Promise<boolean> {
  const configName = normalizeConfigName(name);
  if (!configName) {
    throw new BailianError("Cannot delete the default profile.", ExitCode.USAGE);
  }
  const raw = readRawConfigObject();
  if (!isConfigBlock(raw[configName])) return false;
  delete raw[configName];
  if (readStoredActiveConfigName(raw, false) === configName) raw[ACTIVE_CONFIG_KEY] = "default";
  await writeRawConfigObject(raw);
  return true;
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

export interface ApiKeyResolutionSourceSelection {
  sources: ResolutionSources;
  /** Named Profile whose file-backed API credential was replaced by default. */
  fallbackFrom?: string;
}

/**
 * Select the file-backed API-key source for a command capability. Only a
 * persisted Profile capability list enables fallback. An explicit flag or
 * environment API connection override bypasses it entirely.
 */
export function selectApiKeyResolutionSources(
  sources: ResolutionSources,
  capability: string,
): ApiKeyResolutionSourceSelection {
  if (
    sources.flags.apiKey ||
    sources.flags.baseUrl ||
    sources.env.DASHSCOPE_API_KEY?.trim() ||
    sources.env.DASHSCOPE_BASE_URL
  ) {
    return { sources };
  }
  if (!sources.configName) return { sources };

  const allowedCapabilities = sources.file.api_key_capabilities;
  if (allowedCapabilities === undefined) return { sources };
  if (allowedCapabilities.includes(capability)) return { sources };

  return {
    sources: {
      ...sources,
      file: readConfigFile(),
      configName: undefined,
    },
    fallbackFrom: sources.configName,
  };
}

export function buildSources(flags: Partial<SourceFlags>): ResolutionSources {
  const raw = readRawConfigObject();
  const configExplicit = flags.config !== undefined;
  const activeConfigName = readStoredActiveConfigName(raw, !configExplicit);
  const configName = configExplicit ? normalizeConfigName(flags.config) : activeConfigName;
  return {
    flags,
    file: parseConfigFile(readRawConfigBlock(raw, configName)),
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
    output: detectOutputFormat(flags.output || env.DASHSCOPE_OUTPUT || file.output),
    outputExplicit: Boolean(flags.output || env.DASHSCOPE_OUTPUT || file.output),
    outputDir: file.output_dir || undefined,
    timeout,
    defaultTextModel: file.default_text_model,
    defaultVideoModel: file.default_video_model,
    defaultImageToVideoModel: file.default_image_to_video_model,
    defaultReferenceToVideoModel: file.default_reference_to_video_model,
    defaultImageModel: file.default_image_model,
    defaultSpeechModel: file.default_speech_model,
    defaultSpeechRecognitionModel: file.default_speech_recognition_model,
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
