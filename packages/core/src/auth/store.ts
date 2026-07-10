import type { ConfigFile } from "../config/schema.ts";
import type { ResolutionSources } from "../config/loader.ts";
import { readConfigFile, writeConfigFile } from "../config/loader.ts";
import type { AuthState } from "./types.ts";
import { describeAuthState, resolveModelBaseUrl } from "./resolver.ts";

const LOGOUT_KEYS = {
  console: ["access_token"],
  openapi: ["access_key_id", "access_key_secret"],
  all: ["api_key", "access_token", "access_key_id", "access_key_secret"],
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
>;

/**
 * auth 命令族的凭证能力面(lint 限定 commands/auth/** 使用)。
 * 登录产生的全部落盘走 login,不放宽 configStore 的边界。
 */
export interface AuthStore {
  /** 各域"将会解析出"的凭证快照(auth status 用)。 */
  describe(): AuthState;
  /** 磁盘上当前是否存有各域凭证(区别于 describe:只看 file,不含 flag/env 源)。 */
  stored(): { apiKey: boolean; console: boolean; openapi: boolean };
  /** model 域 baseUrl 链(flag > env > file > 默认);验证 API key 等无凭证场景用。 */
  resolveBaseUrl(): string;
  /** 登录落盘:合并写入,undefined 键忽略。 */
  login(patch: AuthPersistPatch): Promise<void>;
  /** 清凭证:console/openapi 只删对应域;all 清全部登录凭证。返回是否有变更。 */
  logout(scope: "console" | "openapi" | "all"): Promise<boolean>;
}

export function makeAuthStore(sources: ResolutionSources): AuthStore {
  return {
    describe: () => describeAuthState(sources),
    stored() {
      const file = readConfigFile();
      return {
        apiKey: !!file.api_key,
        console: !!file.access_token,
        openapi: !!(file.access_key_id || file.access_key_secret),
      };
    },
    resolveBaseUrl: () => resolveModelBaseUrl(sources),
    async login(patch) {
      const existing = readConfigFile() as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) existing[key] = value;
      }
      await writeConfigFile(existing);
    },
    async logout(scope) {
      const existing = readConfigFile() as Record<string, unknown>;
      const keys = LOGOUT_KEYS[scope];
      const had = keys.some((key) => existing[key] !== undefined);
      if (!had) return false;
      for (const key of keys) delete existing[key];
      await writeConfigFile(existing);
      return true;
    },
  };
}
