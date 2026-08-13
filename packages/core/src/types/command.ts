import type { Identity, Settings } from "../config/schema.ts";
import type { ConfigStore } from "../config/store.ts";
import type { AuthStore } from "../auth/store.ts";
import type { Client } from "../client/client.ts";
import type { CommandPackManager } from "./command-pack-manager.ts";

export type LocalizedText = string | { readonly "en-US": string; readonly "zh-CN": string };

// ── Flag definitions ─────────────────────────────────────────────────────────
// Flags are keyed by camelCase name (the key IS the parsed flag name, e.g.
// `maxTokens` ↔ `--max-tokens`). The flag's type drives both runtime parsing
// and the compile-time flag types inferred via ParsedFlags.

/** A presence flag: `--quiet`. No value; absent → false. */
export interface SwitchFlag {
  type: "switch";
  description: LocalizedText;
}
/** A value flag: `--prompt <text>`, `--n <count>`, `--watermark true|false`. */
export interface ValueFlag {
  type: "string" | "number" | "boolean" | "array";
  description: LocalizedText;
  valueHint: string;
  required?: boolean;
  /**
   * Restrict to a fixed set of values. The parser rejects anything else and the
   * parsed type narrows to the union. Declare with `as const` so the literals
   * survive inference: `choices: ["mp3", "wav"] as const`.
   */
  choices?: readonly string[];
}
export type FlagDef = SwitchFlag | ValueFlag;
export type FlagsDef = Record<string, FlagDef>;

// ── Type inference: definition → parsed flag types ───────────────────────────
type ParsedValue<F extends FlagDef> = F extends SwitchFlag
  ? boolean
  : F extends { type: "number" }
    ? number
    : F extends { type: "boolean" }
      ? boolean
      : F extends { choices: readonly (infer C extends string)[] }
        ? F extends { type: "array" }
          ? C[]
          : C
        : F extends { type: "array" }
          ? string[]
          : string;

/** Switches and `required` value flags are present; other value flags optional. */
type IsRequired<F extends FlagDef> = F extends SwitchFlag
  ? true
  : F extends { required: true }
    ? true
    : false;

/**
 * Map a FlagsDef to the parsed flags object type. Required flags (switches +
 * `required: true`) are required properties; optional value flags are `?`.
 */
export type ParsedFlags<F extends FlagsDef> = {
  [K in keyof F as IsRequired<F[K]> extends true ? K : never]: ParsedValue<F[K]>;
} & {
  [K in keyof F as IsRequired<F[K]> extends true ? never : K]?: ParsedValue<F[K]>;
};

export type AuthRequirement = "apiKey" | "console" | "openapi" | "none";

// ── Flag 分组:全局(所有命令) + 凭证域(按命令的 auth 可见) ────────────────────
/** 所有命令都可用的全局 flag。 */
export const GLOBAL_FLAGS = {
  output: {
    type: "string",
    valueHint: "<format>",
    description: { "en-US": "Output format: text, json", "zh-CN": "输出格式：text、json" },
  },
  timeout: {
    type: "number",
    valueHint: "<seconds>",
    description: { "en-US": "Request timeout", "zh-CN": "请求超时时间" },
  },
  quiet: {
    type: "switch",
    description: { "en-US": "Suppress non-essential output", "zh-CN": "隐藏非必要输出" },
  },
  verbose: {
    type: "switch",
    description: {
      "en-US": "Print HTTP request/response details",
      "zh-CN": "打印 HTTP 请求和响应详情",
    },
  },
  dryRun: {
    type: "switch",
    description: { "en-US": "Dry run mode", "zh-CN": "仅预览，不实际执行" },
  },
  config: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Use a config profile for this command",
      "zh-CN": "为当前命令使用指定配置 Profile",
    },
  },
  help: {
    type: "switch",
    description: { "en-US": "Show help", "zh-CN": "显示帮助信息" },
  },
  version: {
    type: "switch",
    description: { "en-US": "Print version", "zh-CN": "显示版本信息" },
  },
} satisfies FlagsDef;

/** Command-scoped flag for commands that support parallel API calls. */
export const CONCURRENT_FLAG = {
  concurrent: {
    type: "number",
    valueHint: "<n>",
    description: "Run N parallel requests (default: 1)",
  },
} satisfies FlagsDef;

/** Command-scoped flag for task-based commands that can return without polling. */
export const ASYNC_FLAG = {
  async: {
    type: "switch",
    description: "Return async task id without waiting",
  },
} satisfies FlagsDef;

/** Model 域凭证/连接 flag,`auth: "apiKey"` 命令可见。 */
export const MODEL_AUTH_FLAGS = {
  apiKey: {
    type: "string",
    valueHint: "<key>",
    description: { "en-US": "API key", "zh-CN": "API Key" },
  },
  baseUrl: {
    type: "string",
    valueHint: "<url>",
    description: { "en-US": "API base URL", "zh-CN": "API Base URL" },
  },
} satisfies FlagsDef;

/** Console 域目标/作用域 flag,`auth: "console"` 命令可见。 */
export const CONSOLE_AUTH_FLAGS = {
  consoleRegion: {
    type: "string",
    valueHint: "<region>",
    description: {
      "en-US": "Console gateway region (e.g. cn-beijing, ap-southeast-1)",
      "zh-CN": "控制台网关地域（例如 cn-beijing、ap-southeast-1）",
    },
  },
  consoleSite: {
    type: "string",
    valueHint: "<site>",
    description: {
      "en-US": "Console site: domestic, international",
      "zh-CN": "控制台站点：domestic、international",
    },
  },
  consoleSwitchAgent: {
    type: "number",
    valueHint: "<uid>",
    description: {
      "en-US": "Switch agent UID for delegated access",
      "zh-CN": "切换代理访问的 UID",
    },
  },
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Workspace ID (env: BAILIAN_WORKSPACE_ID)",
      "zh-CN": "Workspace ID（环境变量：BAILIAN_WORKSPACE_ID）",
    },
  },
} satisfies FlagsDef;

/** Alibaba Cloud OpenAPI AK/SK credential flags, visible to `auth: "openapi"` commands. */
export const OPENAPI_AUTH_FLAGS = {
  accessKeyId: {
    type: "string",
    valueHint: "<key>",
    description: {
      "en-US": "Alibaba Cloud Access Key ID (env: ALIBABA_CLOUD_ACCESS_KEY_ID)",
      "zh-CN": "阿里云 Access Key ID（环境变量：ALIBABA_CLOUD_ACCESS_KEY_ID）",
    },
  },
  accessKeySecret: {
    type: "string",
    valueHint: "<key>",
    description: {
      "en-US": "Alibaba Cloud Access Key Secret (env: ALIBABA_CLOUD_ACCESS_KEY_SECRET)",
      "zh-CN": "阿里云 Access Key Secret（环境变量：ALIBABA_CLOUD_ACCESS_KEY_SECRET）",
    },
  },
  securityToken: {
    type: "string",
    valueHint: "<token>",
    description: {
      "en-US": "Alibaba Cloud STS Security Token (env: ALIBABA_CLOUD_SECURITY_TOKEN)",
      "zh-CN": "阿里云 STS Security Token（环境变量：ALIBABA_CLOUD_SECURITY_TOKEN）",
    },
  },
} satisfies FlagsDef;

/** sources 里可能出现的全部 flag(全局 + 凭证域)。 */
export type SourceFlags = ParsedFlags<
  typeof GLOBAL_FLAGS &
    typeof MODEL_AUTH_FLAGS &
    typeof CONSOLE_AUTH_FLAGS &
    typeof OPENAPI_AUTH_FLAGS
>;

/** 该命令可见的凭证域 flag 定义。 */
export function credentialFlagDefs(cmd: { auth: AuthRequirement }): FlagsDef {
  if (cmd.auth === "apiKey") return MODEL_AUTH_FLAGS;
  if (cmd.auth === "console") return CONSOLE_AUTH_FLAGS;
  if (cmd.auth === "openapi") return OPENAPI_AUTH_FLAGS;
  return {};
}

/**
 * What a command's `run` receives: `client` for all network calls (its
 * credential is already injected per the command's `auth`), `settings` for the
 * resolved configuration surface, `identity` for product identity, and `flags`
 * for parsed arguments. Never handle tokens or baseUrl.
 */
export interface CommandContext<F extends FlagsDef = FlagsDef> {
  /** 静态产品身份(binName/version/npmPackage/clientName)。 */
  identity: Identity;
  /** flag/env/file 解析后的有效配置面。 */
  settings: Settings;
  /** 只含本命令声明的 flag;全局 flag 经 settings 读。 */
  flags: ParsedFlags<F>;
  /** Network surface; the credential for the command's `auth` is pre-injected. */
  client: Client;
  /** 配置持久化能力；lint 限定 commands/config/** 使用。 */
  configStore: ConfigStore;
  /** 鉴权持久化能力；lint 限定 commands/auth/** 使用。 */
  authStore: AuthStore;
  /** Command Pack 管理能力；lint 限定 commands/plugin/** 使用。 */
  commandPacks: CommandPackManager;
}

// ── Command ──────────────────────────────────────────────────────────────────
/**
 * A command. Generic over its flags `F` so `run`/`validate` receive precisely
 * typed flags (`ParsedFlags<F>` = 命令自有 flag). Stored heterogeneously as
 * {@link AnyCommand}; the precise typing lives at the `defineCommand` call site.
 */
export interface Command<F extends FlagsDef = FlagsDef> {
  description: LocalizedText;
  /** Credential this command requires. See {@link AuthRequirement}. */
  auth: AuthRequirement;
  /** Usage line arg portion, e.g. "--prompt <text> [flags]". Manually written. */
  usageArgs?: string;
  /** Example arg strings (without the `<bin> <path>` prefix). */
  exampleArgs?: string[];
  notes?: string[];
  flags?: F;
  /**
   * Cross-flag validation, after parsing and before run. Return an error message
   * → UsageError; undefined to pass. Single-flag `required` is enforced by the
   * parser — use this for rules spanning flags or depending on a flag's *value*.
   */
  validate?: (flags: ParsedFlags<F>) => string | undefined;
  run: (ctx: CommandContext<F>) => Promise<void>;
}

/** Type-erased command for heterogeneous storage (registry / context). */
export type AnyCommand = Command<any>;

/** Identity wrapper whose only job is to infer `F` from `spec.flags`. */
export function defineCommand<F extends FlagsDef>(spec: Command<F>): Command<F> {
  return spec;
}
