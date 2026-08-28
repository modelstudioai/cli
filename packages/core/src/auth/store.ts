import type { ConfigFile } from "../config/schema.ts";
import type { ResolutionSources } from "../config/loader.ts";
import { readConfigFile, writeConfigFile } from "../config/loader.ts";
import { getConfigPath } from "../config/paths.ts";
import { normalizeModelBaseUrl } from "../config/model-base-url.ts";
import type { AuthState } from "./types.ts";
import { describeAuthState, resolveModelBaseUrl } from "./resolver.ts";

const LOGOUT_KEYS = {
  console: ["access_token"],
  openapi: ["access_key_id", "access_key_secret", "security_token"],
  all: [
    "api_key",
    "base_url",
    "access_token",
    "access_key_id",
    "access_key_secret",
    "security_token",
  ],
} as const;

/** 登录允许落盘的键:凭证本体 + 登录回调携带的连接/作用域字段。 */
export type AuthPersistPatch = Pick<
  ConfigFile,
  | "api_key"
  | "access_token"
  | "access_key_id"
  | "access_key_secret"
  | "security_token"
  | "base_url"
  | "console_site"
  | "console_region"
  | "console_switch_agent"
  | "workspace_id"
  | "default_text_model"
  | "default_video_model"
  | "default_image_to_video_model"
  | "default_reference_to_video_model"
  | "default_image_model"
  | "default_speech_model"
  | "default_speech_recognition_model"
  | "api_key_capabilities"
>;

/**
 * auth 命令族的凭证能力面(lint 限定 commands/auth/** 使用)。
 * 登录产生的全部落盘走 login,不放宽 configStore 的边界。
 */
export interface AuthStore {
  /** 各域"将会解析出"的凭证快照(auth status 用)。 */
  describe(): AuthState;
  /** 磁盘上当前是否存有各域凭证，以及 model baseUrl/capability 配置（只看 file，不含 flag/env 源）。 */
  stored(): {
    apiKey: boolean;
    console: boolean;
    openapi: boolean;
    baseUrl?: string;
    apiKeyCapabilities?: string[];
  };
  /** model 域 baseUrl 链(flag > env > config file > fallback)。 */
  resolveBaseUrl(fallback?: string): string;
  /** 登录落盘:合并写入,undefined 键忽略；显式 --config 成功后同时激活目标 Profile。 */
  login(patch: AuthPersistPatch): Promise<void>;
  /** 清凭证:console/openapi 只删对应域;all 清全部登录凭证和 model baseUrl。返回是否有变更。 */
  logout(scope: "console" | "openapi" | "all"): Promise<boolean>;
  /** 实际写入的 config.json 路径(不受命名配置影响,一直是同一个文件)。 */
  path: string;
}

export function makeAuthStore(sources: ResolutionSources): AuthStore {
  const configName = sources.configName;
  const activateAfterLogin = sources.flags.config !== undefined;
  return {
    // Read the config block live (not the startup `sources.file` snapshot) so
    // long-lived processes like `config ui` reflect a fresh login without a
    // restart. For one-shot commands this reads the same content the snapshot
    // held, so behavior is unchanged.
    describe: () => describeAuthState({ ...sources, file: readConfigFile(configName) }),
    stored() {
      const file = readConfigFile(configName);
      return {
        apiKey: !!file.api_key,
        console: !!file.access_token,
        openapi: !!(file.access_key_id || file.access_key_secret || file.security_token),
        baseUrl: file.base_url,
        apiKeyCapabilities: file.api_key_capabilities,
      };
    },
    resolveBaseUrl: (fallback) => resolveModelBaseUrl(sources, fallback),
    async login(patch) {
      const existing = readConfigFile(configName) as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
          existing[key] = key === "base_url" ? normalizeModelBaseUrl(String(value)) : value;
        }
      }
      await writeConfigFile(existing, configName, { activate: activateAfterLogin });
    },
    async logout(scope) {
      const existing = readConfigFile(configName) as Record<string, unknown>;
      const keys = LOGOUT_KEYS[scope];
      const had = keys.some((key) => existing[key] !== undefined);
      if (!had) return false;
      for (const key of keys) delete existing[key];
      await writeConfigFile(existing, configName);
      return true;
    },
    get path() {
      return sources.configPath ?? getConfigPath();
    },
  };
}
