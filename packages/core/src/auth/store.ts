import type { ConfigFile } from "../config/schema.ts";
import type { ResolutionSources } from "../config/loader.ts";
import { readConfigFile, mutateConfigFile } from "../config/loader.ts";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { withFileLock } from "../utils/file-lock.ts";
import { createOAuthSecretStore, type OAuthSecretStore } from "./secure-store.ts";
import {
  oauthSessionLockPath,
  parseOAuthSession,
  oauthConfigurationFingerprint,
  assertOAuthConfiguration,
} from "./openapi-provider.ts";
import { revokeAliyunTokens, type AliyunOAuthDeps } from "./aliyun-oauth.ts";
import type { AliyunOAuthProfile, AliyunOAuthSession } from "./aliyun-types.ts";
import { CredentialError } from "../errors/credential.ts";
import { getConfigPath } from "../config/paths.ts";
import { validatePreAliyunProfile } from "../config/control-plane.ts";
import { normalizeModelBaseUrl } from "../config/model-base-url.ts";
import { resolveApiKeyLoginConfigName } from "../config/profile-presets.ts";
import type { AuthState } from "./types.ts";
import { describeAuthState, resolveModelBaseUrl } from "./resolver.ts";

const LOGOUT_KEYS = {
  console: ["access_token"],
  openapi: ["access_key_id", "access_key_secret", "security_token"],
  aliyun: [],
  all: [
    "aliyun_oauth",
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
    aliyunOAuth?: boolean;
  };
  /** model 域 baseUrl 链(flag > env > config file > fallback)。 */
  resolveBaseUrl(fallback?: string): string;
  /** 登录落盘:合并写入,undefined 键忽略；显式 --config 成功后同时激活目标 Profile。 */
  login(patch: AuthPersistPatch): Promise<void>;
  loginAliyun(
    profile: Omit<AliyunOAuthProfile, "session_ref">,
    session: AliyunOAuthSession,
  ): Promise<void>;
  /** 清凭证:console/openapi 只删对应域;all 清全部登录凭证和 model baseUrl。返回是否有变更。 */
  logout(scope: "console" | "openapi" | "aliyun" | "all"): Promise<boolean>;
  /** 实际写入的 config.json 路径(不受命名配置影响,一直是同一个文件)。 */
  path: string;
}

export function makeAuthStore(
  sources: ResolutionSources,
  oauthDeps?: AliyunOAuthDeps,
  options: { store?: OAuthSecretStore; directory?: string } = {},
): AuthStore {
  const configName = sources.configName;
  const activateAfterLogin = sources.flags.config !== undefined;
  const pre = sources.preControlPlane;
  const configurationPath = sources.configPath ?? getConfigPath(pre);
  const directory = options.directory ?? dirname(configurationPath);
  const readBoundConfig = (name = configName) => readConfigFile(name, configurationPath);
  let secretStore = options.store;
  const getSecretStore = () => (secretStore ??= createOAuthSecretStore(directory));
  return {
    // Read the config block live (not the startup `sources.file` snapshot) so
    // long-lived processes like `config ui` reflect a fresh login without a
    // restart. For one-shot commands this reads the same content the snapshot
    // held, so behavior is unchanged.
    describe: () => describeAuthState({ ...sources, file: readBoundConfig() }),
    stored() {
      const file = readBoundConfig();
      return {
        apiKey: !!file.api_key,
        console: !!(file.access_token || file.aliyun_oauth?.console_enabled),
        openapi: !!(
          file.access_key_id ||
          file.access_key_secret ||
          file.security_token ||
          file.aliyun_oauth?.openapi_enabled
        ),
        ...(file.aliyun_oauth ? { aliyunOAuth: true } : {}),
        baseUrl: file.base_url,
        apiKeyCapabilities: file.api_key_capabilities,
      };
    },
    resolveBaseUrl: (fallback) => resolveModelBaseUrl(sources, fallback),
    async login(patch) {
      const targetConfigName = patch.api_key
        ? resolveApiKeyLoginConfigName(patch.api_key, configName, activateAfterLogin)
        : configName;
      const shouldActivate = activateAfterLogin || targetConfigName !== configName;
      await mutateConfigFile(
        (current) => {
          const existing = { ...current } as Record<string, unknown>;
          for (const [key, value] of Object.entries(patch)) {
            if (value !== undefined) {
              if (key === "api_key_capabilities" && Array.isArray(value)) {
                const storedCapabilities = Array.isArray(existing[key]) ? existing[key] : [];
                existing[key] = [...new Set([...storedCapabilities, ...value])];
              } else
                existing[key] = key === "base_url" ? normalizeModelBaseUrl(String(value)) : value;
            }
          }
          if (current.aliyun_oauth) {
            existing.aliyun_oauth = {
              ...current.aliyun_oauth,
              ...(patch.access_token !== undefined ? { console_enabled: false } : {}),
              ...(patch.access_key_id !== undefined || patch.access_key_secret !== undefined
                ? { openapi_enabled: false }
                : {}),
            };
          }
          return existing as ConfigFile;
        },
        targetConfigName,
        { activate: shouldActivate, path: configurationPath },
      );
    },
    async loginAliyun(profile, session) {
      if (pre) validatePreAliyunProfile(profile);
      const reference = randomUUID();
      let previous: AliyunOAuthProfile | undefined;
      const metadata: AliyunOAuthProfile = {
        ...profile,
        session_ref: reference,
        console_enabled: true,
        openapi_enabled: true,
        access_token_expires_at: session.accessTokenExpiresAt,
        sts_expires_at: session.sts?.expiresAt,
      };
      await withFileLock(oauthSessionLockPath(directory, reference), async () => {
        await getSecretStore().write(
          reference,
          JSON.stringify({
            ...session,
            configurationFingerprint: oauthConfigurationFingerprint(metadata),
          }),
        );
        try {
          await mutateConfigFile(
            (current) => {
              previous = current.aliyun_oauth;
              return {
                ...current,
                aliyun_oauth: metadata,
                console_region: profile.console_region,
                console_site: "domestic",
                console_switch_agent: undefined,
              };
            },
            configName,
            { activate: activateAfterLogin, path: configurationPath },
          );
        } catch (error) {
          await getSecretStore()
            .remove(reference)
            .catch(() => {});
          throw error;
        }
      });
      if (previous) {
        const referenceToRemove = previous.session_ref;
        try {
          await withFileLock(oauthSessionLockPath(directory, referenceToRemove), () =>
            getSecretStore().remove(referenceToRemove),
          );
        } catch {
          oauthDeps?.warning?.({
            message: {
              "en-US": "Signed in, but the previous OAuth session file could not be removed.",
              "zh-CN": "登录成功，但未能清理之前的 OAuth 会话文件。",
            },
          });
        }
      }
    },
    async logout(scope) {
      const profile = readBoundConfig().aliyun_oauth;
      const clearConfig = async (reference?: string, removeOAuth = false) => {
        let cleared = false;
        await mutateConfigFile(
          (current) => {
            if (reference && current.aliyun_oauth?.session_ref !== reference) return undefined;
            const existing = { ...current };
            const keys = LOGOUT_KEYS[scope];
            cleared = keys.some((key) => existing[key] !== undefined) || Boolean(reference);
            if (!cleared) return undefined;
            for (const key of keys) delete existing[key];
            if (removeOAuth) delete existing.aliyun_oauth;
            else if (existing.aliyun_oauth)
              existing.aliyun_oauth = {
                ...existing.aliyun_oauth,
                ...(scope === "console" ? { console_enabled: false } : {}),
                ...(scope === "openapi" ? { openapi_enabled: false } : {}),
              };
            return existing;
          },
          configName,
          { path: configurationPath },
        );
        return cleared;
      };
      if (!profile) return clearConfig();
      return withFileLock(oauthSessionLockPath(directory, profile.session_ref), async () => {
        const current = readBoundConfig().aliyun_oauth;
        if (current?.session_ref !== profile.session_ref) return false;
        if (pre) validatePreAliyunProfile(current);
        const removeOAuth = scope === "all" || scope === "aliyun";
        const raw = await getSecretStore().read(profile.session_ref);
        if (removeOAuth) {
          if (raw) {
            const session = parseOAuthSession(raw);
            assertOAuthConfiguration(profile, session);
            if (session.refreshToken) {
              if (!oauthDeps)
                throw new CredentialError(
                  "missing-aliyun-session",
                  "OAuth logout requires OAuth transport dependencies. / OAuth 退出需要 OAuth 传输配置。",
                );
              await revokeAliyunTokens(profile, session.refreshToken, oauthDeps);
            }
          }
          await getSecretStore().remove(profile.session_ref);
          return clearConfig(profile.session_ref, true);
        }
        if (scope === "console" && raw) {
          const session = parseOAuthSession(raw);
          await getSecretStore().write(
            profile.session_ref,
            JSON.stringify({ ...session, consoleTokens: {} }),
          );
        }
        return clearConfig(profile.session_ref);
      });
    },
    get path() {
      return configurationPath;
    },
  };
}
