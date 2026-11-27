import type { OutputDiagnostic } from "../types/output.ts";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  openSync,
  closeSync,
  fsyncSync,
  unlinkSync,
} from "fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { withFileLock } from "../utils/file-lock.ts";
import { CONFIG_FILE_KEYS, parseConfigFile, type ConfigFile, type Settings } from "./schema.ts";
import { ensureConfigDir, getConfigPath, isPreConfigPath } from "./paths.ts";
import type { PreControlPlane } from "./control-plane.ts";
import { detectOutputFormat } from "../output/formatter.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { SourceFlags } from "../types/command.ts";
import { validateTimeout } from "./validation.ts";

const CONFIG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ACTIVE_CONFIG_KEY = "active_config";
const CONTROL_ENVIRONMENT_KEY = "control_environment";

function isReservedConfigKey(key: string): boolean {
  return (
    key === ACTIVE_CONFIG_KEY ||
    key === CONTROL_ENVIRONMENT_KEY ||
    (CONFIG_FILE_KEYS as readonly string[]).includes(key)
  );
}

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
  if (isReservedConfigKey(name)) {
    throw new BailianError(
      `Invalid config name "${name}". It conflicts with a config key.`,
      ExitCode.USAGE,
    );
  }
  return name;
}

function configEnvironmentMismatch(path: string): BailianError {
  return new BailianError(
    `Config file does not match the selected control-plane environment: ${path}. / 配置文件与当前控制面环境不匹配：${path}。`,
    ExitCode.USAGE,
  );
}

function assertConfigEnvironment(raw: unknown, path: string): void {
  if (isPreConfigPath(path)) {
    if (!isConfigBlock(raw) || raw[CONTROL_ENVIRONMENT_KEY] !== "pre") {
      throw configEnvironmentMismatch(path);
    }
  } else if (isConfigBlock(raw) && Object.hasOwn(raw, CONTROL_ENVIRONMENT_KEY)) {
    throw configEnvironmentMismatch(path);
  }
}

/** 读完整配置原始对象（不经过 `parseConfigFile` 过滤），保留其他命名配置 block。 */
function readRawConfigObject(
  path: string,
  onWarning?: (warning: OutputDiagnostic) => void,
): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return isPreConfigPath(path) ? { [CONTROL_ENVIRONMENT_KEY]: "pre" } : {};
    }
    if (!(error instanceof SyntaxError)) throw error;
    if (isPreConfigPath(path)) throw configEnvironmentMismatch(path);
    onWarning?.({
      code: "CONFIG_CORRUPTED",
      message: {
        "en-US": "Config file is corrupted; using defaults.",
        "zh-CN": "配置文件已损坏，将使用默认配置。",
      },
    });
    return {};
  }
  assertConfigEnvironment(raw, path);
  return isConfigBlock(raw) ? raw : {};
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

export function readConfigFile(configName?: string, path = getConfigPath()): ConfigFile {
  const raw = readRawConfigObject(path);
  return parseConfigFile(readRawConfigBlock(raw, configName));
}

/** 写入所选 Profile；登录流程可在同一次原子写入中将显式 Profile 设为激活项。 */
export async function writeConfigFile(
  data: Record<string, unknown>,
  configName?: string,
  options: { activate?: boolean; path?: string } = {},
): Promise<void> {
  await mutateConfigFile(() => data as ConfigFile, configName, options);
}

export async function mutateConfigFile(
  update: (current: ConfigFile) => ConfigFile | undefined,
  configName?: string,
  options: { activate?: boolean; path?: string } = {},
): Promise<boolean> {
  const path = options.path ?? getConfigPath();
  if (configName === CONTROL_ENVIRONMENT_KEY) normalizeConfigName(configName);
  await ensureConfigDir(dirname(path));
  return withFileLock(`${path}.lock`, async () => {
    const raw = readRawConfigObject(path);
    const next = update(parseConfigFile(readRawConfigBlock(raw, configName)));
    if (next === undefined) return false;
    if (Object.hasOwn(next, CONTROL_ENVIRONMENT_KEY)) {
      throw new BailianError(
        "control_environment is reserved config metadata. / control_environment 是保留的配置元数据。",
        ExitCode.USAGE,
      );
    }
    if (configName) raw[configName] = next;
    else {
      for (const key of CONFIG_FILE_KEYS) delete raw[key];
      Object.assign(raw, next);
    }
    if (options.activate) raw[ACTIVE_CONFIG_KEY] = configName ?? "default";
    writeRawConfigObject(raw, path);
    return true;
  });
}

function writeRawConfigObject(raw: Record<string, unknown>, path: string): void {
  assertConfigEnvironment(raw, path);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  const handle = openSync(temporaryPath, "wx", 0o600);
  try {
    try {
      writeFileSync(handle, JSON.stringify(raw, null, 2) + "\n");
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
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
 * 命名 block = raw 中不属于默认配置字段或保留元数据、且值为普通对象的项。
 */
export function readConfigProfiles(path = getConfigPath()): ConfigProfiles {
  const raw = readRawConfigObject(path);
  const named: Record<string, ConfigFile> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isReservedConfigKey(key)) continue;
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
export function validateConfigProfileActivation(name?: unknown, path = getConfigPath()): string {
  return resolveConfigProfileActivation(readRawConfigObject(path), name);
}

/** 将已存在的命名 Profile（或 default）设为持久化激活项。 */
export async function activateConfigProfile(
  name?: unknown,
  path = getConfigPath(),
): Promise<string> {
  await ensureConfigDir(dirname(path));
  return withFileLock(`${path}.lock`, async () => {
    const raw = readRawConfigObject(path);
    const active = resolveConfigProfileActivation(raw, name);
    raw[ACTIVE_CONFIG_KEY] = active;
    writeRawConfigObject(raw, path);
    return active;
  });
}

/** 删除一个命名 profile block；存在才删并回写，返回是否有变更。 */
export async function deleteConfigProfile(
  name?: unknown,
  path = getConfigPath(),
): Promise<boolean> {
  const configName = normalizeConfigName(name);
  if (!configName) {
    throw new BailianError("Cannot delete the default profile.", ExitCode.USAGE);
  }
  await ensureConfigDir(dirname(path));
  return withFileLock(`${path}.lock`, async () => {
    const raw = readRawConfigObject(path);
    if (!isConfigBlock(raw[configName])) return false;
    if (parseConfigFile(raw[configName]).aliyun_oauth)
      throw new BailianError(
        "Remove the OAuth session before deleting this profile. / 删除此配置前请先退出 OAuth 会话。",
        ExitCode.USAGE,
      );
    delete raw[configName];
    if (readStoredActiveConfigName(raw, false) === configName) raw[ACTIVE_CONFIG_KEY] = "default";
    writeRawConfigObject(raw, path);
    return true;
  });
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
  /** 所选环境的配置文件路径，不受 configName 影响。 */
  configPath?: string;
  /** These sources were selected for the pre-release control plane. */
  preControlPlane?: PreControlPlane;
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
      file: readConfigFile(undefined, sources.configPath ?? getConfigPath(sources.preControlPlane)),
      configName: undefined,
    },
    fallbackFrom: sources.configName,
  };
}

function isInheritedControlEnvKey(name: string): boolean {
  // Windows treats environment variable names as case-insensitive.
  const key = name.toUpperCase();
  return (
    key.startsWith("BAILIAN_ACCESS_KEY_") ||
    key.startsWith("ALIBABA_CLOUD_ACCESS_KEY_") ||
    key === "BAILIAN_SECURITY_TOKEN" ||
    key === "ALIBABA_CLOUD_SECURITY_TOKEN" ||
    key === "BAILIAN_WORKSPACE_ID"
  );
}

export function buildSources(
  flags: Partial<SourceFlags>,
  onWarning?: (warning: OutputDiagnostic) => void,
  preControlPlane?: PreControlPlane,
): ResolutionSources {
  const configPath = getConfigPath(preControlPlane);
  const raw = readRawConfigObject(configPath, onWarning);
  const configName =
    flags.config !== undefined
      ? normalizeConfigName(flags.config)
      : readStoredActiveConfigName(raw, true);
  return {
    flags,
    file: parseConfigFile(readRawConfigBlock(raw, configName)),
    env: preControlPlane
      ? Object.fromEntries(
          Object.entries(process.env).filter(([name]) => !isInheritedControlEnvKey(name)),
        )
      : process.env,
    configName,
    configPath,
    ...(preControlPlane ? { preControlPlane } : {}),
  };
}

/** Presentation-only resolution, also safe before config loading or unrelated validation. */
export function buildOutputSettings({
  flags,
  env,
  file = {},
}: Pick<ResolutionSources, "flags" | "env"> & { file?: ConfigFile }): Pick<
  Settings,
  "output" | "outputExplicit" | "outputSource" | "quiet" | "verbose"
> {
  const output = flags.output || env.DASHSCOPE_OUTPUT || file.output;
  return {
    output: detectOutputFormat(output),
    outputExplicit: Boolean(output),
    outputSource: flags.output
      ? "flag"
      : env.DASHSCOPE_OUTPUT
        ? "env"
        : file.output
          ? "file"
          : "default",
    quiet: flags.quiet || env.DASHSCOPE_QUIET === "1",
    verbose: flags.verbose || env.DASHSCOPE_VERBOSE === "1",
  };
}

/**
 * Config name for recovery hints (does not change IO-layer `configName` semantics).
 * Explicit `--config default` is normalized to undefined in the loader; keep
 * `"default"` here so copying the hint does not fall back to an active named profile.
 */
export function resolveRecoveryConfigName(sources: {
  flags: { config?: unknown };
  configName?: string;
}): string | undefined {
  if (sources.flags.config !== undefined) {
    return sources.configName ?? "default";
  }
  return sources.configName;
}

/**
 * 纯解析 sources → Settings(命令唯一会读的配置面)。不含身份、baseUrl、鉴权。
 * 各字段链序 flag > env > file > 默认;锁定表 tests/config-priority.test.ts。
 */
export function buildSettings(s: ResolutionSources): Settings {
  const { flags, file, env } = s;

  const envTimeout = env.DASHSCOPE_TIMEOUT ? Number(env.DASHSCOPE_TIMEOUT) : undefined;
  const validEnvTimeout = validateTimeout(envTimeout) === undefined ? envTimeout : undefined;
  const timeout = flags.timeout ?? validEnvTimeout ?? file.timeout ?? 300;
  const timeoutError = validateTimeout(timeout);
  if (timeoutError) {
    throw new BailianError(timeoutError["en-US"], ExitCode.USAGE);
  }

  return {
    ...(s.preControlPlane ? { preControlPlane: s.preControlPlane } : {}),
    configPath: s.configPath ?? getConfigPath(s.preControlPlane),
    configName: s.configName,
    recoveryConfigName: resolveRecoveryConfigName(s),
    ...buildOutputSettings(s),
    outputDir: file.output_dir || undefined,
    timeout,
    watermark: file.watermark ?? true,
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
    dryRun: flags.dryRun || false,
    telemetry: env.DO_NOT_TRACK === "1" ? false : (file.telemetry ?? true),
    bizFrom: flags.bizFrom ?? undefined,
  };
}
