import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { readConfigFile, mutateConfigFile, type ResolutionSources } from "../config/loader.ts";
import { getConfigPath } from "../config/paths.ts";
import {
  requirePreConsoleGateway,
  resolvePreOpenApiHost,
  validatePreAliyunProfile,
} from "../config/control-plane.ts";
import { CredentialError } from "../errors/credential.ts";
import { UsageError, BailianError } from "../errors/base.ts";
import { withFileLock } from "../utils/file-lock.ts";
import { resolveOpenApi } from "./resolver.ts";
import { createOAuthSecretStore, type OAuthSecretStore } from "./secure-store.ts";
import { exchangeAliyunSts, refreshAliyunTokens, type AliyunOAuthDeps } from "./aliyun-oauth.ts";
import type {
  AliyunOAuthProfile,
  AliyunOAuthSession,
  OpenApiCredentialProvider,
} from "./aliyun-types.ts";
import type { ConsoleCredential, OpenApiCredential } from "./types.ts";

type Purpose = "openapi" | "console";
type ConsoleTarget = Omit<ConsoleCredential, "token" | "source">;

export function oauthConfigurationFingerprint(
  profile: Omit<AliyunOAuthProfile, "session_ref" | "console_enabled" | "openapi_enabled">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        profile.client_id,
        profile.scope,
        profile.authorization_url,
        profile.oauth_base_url,
        profile.modelstudio_host,
        profile.bailiancontrol_host ?? null,
        profile.console_gateway,
        profile.console_region,
      ]),
    )
    .digest("hex");
}

export function assertOAuthConfiguration(
  profile: AliyunOAuthProfile,
  session: AliyunOAuthSession,
): void {
  if (session.configurationFingerprint !== oauthConfigurationFingerprint(profile))
    throw new CredentialError(
      "missing-aliyun-session",
      "The OAuth endpoints or client configuration changed; sign in again. / OAuth 端点或客户端配置已变更，请重新登录。",
    );
}

export function oauthSessionLockPath(directory: string, reference: string): string {
  return join(directory, "oauth", `${reference}.lock`);
}

function selectedOAuth(
  sources: ResolutionSources,
  purpose: Purpose,
): AliyunOAuthProfile | undefined {
  if (
    sources.flags.accessKeyId !== undefined ||
    sources.flags.accessKeySecret !== undefined ||
    sources.env.BAILIAN_ACCESS_KEY_ID?.trim() ||
    sources.env.BAILIAN_ACCESS_KEY_SECRET?.trim()
  )
    return undefined;
  const profile = sources.file.aliyun_oauth;
  return profile?.[purpose === "console" ? "console_enabled" : "openapi_enabled"]
    ? profile
    : undefined;
}

function hasCompleteCredentialOverride(sources: ResolutionSources): boolean {
  if (sources.flags.accessKeyId !== undefined || sources.flags.accessKeySecret !== undefined)
    return Boolean(sources.flags.accessKeyId?.trim() && sources.flags.accessKeySecret?.trim());
  return Boolean(
    sources.env.BAILIAN_ACCESS_KEY_ID?.trim() && sources.env.BAILIAN_ACCESS_KEY_SECRET?.trim(),
  );
}

function staticCredential(sources: ResolutionSources): OpenApiCredential {
  return resolveOpenApi({ ...sources, file: { ...sources.file, aliyun_oauth: undefined } });
}

export function consoleCredentialKey(target: ConsoleTarget): string {
  return JSON.stringify([
    target.region,
    target.site,
    target.switchAgent ?? null,
    target.gateway ?? null,
  ]);
}

export function parseOAuthSession(raw: string | undefined): AliyunOAuthSession {
  if (!raw)
    throw new CredentialError(
      "missing-aliyun-session",
      "The Aliyun OAuth session is missing. / 阿里云 OAuth 会话缺失。",
    );
  let session: AliyunOAuthSession;
  try {
    session = JSON.parse(raw);
  } catch {
    throw new CredentialError(
      "missing-aliyun-session",
      "The Aliyun OAuth session is corrupted. / 阿里云 OAuth 会话已损坏。",
    );
  }
  if (
    !session ||
    typeof session.accessToken !== "string" ||
    typeof session.refreshToken !== "string" ||
    typeof session.accessTokenExpiresAt !== "number" ||
    !Number.isFinite(session.accessTokenExpiresAt)
  )
    throw new CredentialError(
      "missing-aliyun-session",
      "Invalid Aliyun OAuth session. / 阿里云 OAuth 会话无效。",
    );
  if (
    session.sts &&
    (typeof session.sts.accessKeyId !== "string" ||
      !session.sts.accessKeyId ||
      typeof session.sts.accessKeySecret !== "string" ||
      !session.sts.accessKeySecret ||
      typeof session.sts.securityToken !== "string" ||
      !session.sts.securityToken ||
      typeof session.sts.expiresAt !== "number" ||
      !Number.isFinite(session.sts.expiresAt))
  )
    throw new CredentialError(
      "missing-aliyun-session",
      "Invalid cached STS credentials. / 缓存的 STS 凭据无效。",
    );
  if (session.consoleTokens) {
    if (typeof session.consoleTokens !== "object" || Array.isArray(session.consoleTokens))
      throw new CredentialError(
        "missing-aliyun-session",
        "Invalid cached Console credentials. / 缓存的控制台凭据无效。",
      );
    for (const cached of Object.values(session.consoleTokens))
      if (
        !cached ||
        typeof cached.token !== "string" ||
        !cached.token ||
        (cached.expiresAt !== undefined &&
          (typeof cached.expiresAt !== "number" || !Number.isFinite(cached.expiresAt)))
      )
        throw new CredentialError(
          "missing-aliyun-session",
          "Invalid cached Console credentials. / 缓存的控制台凭据无效。",
        );
  }
  return session;
}

export function bindOpenApiConsoleCredentials(
  provider: OpenApiCredentialProvider,
): OpenApiCredentialProvider {
  let identity: string | undefined;
  const getCredential = async () => {
    const credential = await provider.getCredential();
    const selectedIdentity =
      credential.method === "aliyun-oauth"
        ? `${credential.sessionRef}:${credential.configurationFingerprint}`
        : createHash("sha256")
            .update(
              JSON.stringify([
                credential.accessKeyId,
                credential.accessKeySecret,
                credential.securityToken ?? null,
              ]),
            )
            .digest("hex");
    if (identity !== undefined && identity !== selectedIdentity)
      throw new CredentialError(
        "changed-openapi-identity",
        "OpenAPI credentials changed during this command; rerun it with the intended profile. / 命令执行期间 OpenAPI 凭据已变更，请使用目标配置重新执行。",
      );
    identity = selectedIdentity;
    return credential;
  };
  return {
    ...provider,
    getCredential,
    assertAvailable: () => provider.assertAvailable(),
    resolveHost: (host, credential) => provider.resolveHost(host, credential, "openapi"),
    resolveConsoleTarget: (target) => provider.resolveConsoleTarget(target, "openapi"),
    async getConsoleCredential(target) {
      const credential = await getCredential();
      if (credential.method !== "aliyun-oauth") return undefined;
      const cached = await provider.getConsoleCredential(target);
      return cached &&
        cached.sessionRef === credential.sessionRef &&
        cached.configurationFingerprint === credential.configurationFingerprint
        ? cached
        : undefined;
    },
  };
}

export function createOpenApiCredentialProvider(
  sources: ResolutionSources,
  deps: AliyunOAuthDeps,
  options: { store?: OAuthSecretStore; directory?: string } = {},
): OpenApiCredentialProvider {
  const boundSources: ResolutionSources = {
    ...sources,
    flags: { ...sources.flags },
    file: {
      ...sources.file,
      ...(sources.file.aliyun_oauth ? { aliyun_oauth: { ...sources.file.aliyun_oauth } } : {}),
    },
    env: Object.fromEntries(
      [
        "BAILIAN_ACCESS_KEY_ID",
        "BAILIAN_ACCESS_KEY_SECRET",
        "BAILIAN_SECURITY_TOKEN",
        "ALIBABA_CLOUD_ACCESS_KEY_ID",
        "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
        "ALIBABA_CLOUD_SECURITY_TOKEN",
      ].map((name) => [name, sources.env[name]]),
    ),
  };
  const pre = boundSources.preControlPlane;
  const configurationPath = boundSources.configPath ?? getConfigPath(pre);
  const directory = options.directory ?? dirname(configurationPath);
  let store = options.store;
  const getStore = () => (store ??= createOAuthSecretStore(directory));
  const sessions = new Map<string, AliyunOAuthSession>();
  const pending = new Map<string, Promise<OpenApiCredential>>();
  const now = () => deps.now?.() ?? Date.now();
  const currentSources = (): ResolutionSources => ({
    ...boundSources,
    file: readConfigFile(boundSources.configName, configurationPath),
  });
  const assertReference = (profile: AliyunOAuthProfile, purpose: Purpose) => {
    if (pre) validatePreAliyunProfile(profile);
    const current = currentSources().file.aliyun_oauth;
    if (
      current?.session_ref !== profile.session_ref ||
      !current[purpose === "console" ? "console_enabled" : "openapi_enabled"] ||
      oauthConfigurationFingerprint(current) !== oauthConfigurationFingerprint(profile)
    )
      throw new CredentialError(
        "missing-aliyun-session",
        "The OAuth login changed or was removed. / OAuth 登录已变更或被移除。",
      );
  };
  const credentialFrom = (
    profile: AliyunOAuthProfile,
    session: AliyunOAuthSession,
  ): OpenApiCredential => ({
    ...session.sts!,
    source: "config",
    method: "aliyun-oauth",
    sessionRef: profile.session_ref,
    configurationFingerprint: session.configurationFingerprint,
  });
  const save = async (profile: AliyunOAuthProfile, session: AliyunOAuthSession) => {
    await getStore().write(profile.session_ref, JSON.stringify(session));
    sessions.set(profile.session_ref, session);
  };
  const validateTarget = (profile: AliyunOAuthProfile, target: ConsoleTarget) => {
    const gateway = pre ? requirePreConsoleGateway(pre, target) : profile.console_gateway;
    if (
      target.region !== profile.console_region ||
      target.site !== "domestic" ||
      gateway !== profile.console_gateway ||
      (target.gateway !== undefined && target.gateway !== profile.console_gateway)
    )
      throw new UsageError(
        "The Console target differs from the OAuth profile; sign in to a separate profile for that target. / 控制台目标与 OAuth 配置不同，请为该目标登录独立配置。",
      );
  };

  return {
    assertAvailable(purpose = "openapi") {
      if (purpose === "console" && boundSources.file.aliyun_oauth?.console_enabled) return;
      if (!selectedOAuth(boundSources, purpose)) staticCredential(boundSources);
    },
    resolveConsoleTarget(target, purpose = "console") {
      const profile = currentSources().file.aliyun_oauth;
      const active = profile?.[purpose === "console" ? "console_enabled" : "openapi_enabled"];
      if (profile && active) validateTarget(profile, target);
      const gateway = pre
        ? requirePreConsoleGateway(pre, target)
        : profile && active
          ? profile.console_gateway
          : target.gateway;
      return {
        region: target.region,
        site: target.site,
        ...(target.switchAgent !== undefined ? { switchAgent: target.switchAgent } : {}),
        ...(gateway !== undefined ? { gateway } : {}),
      };
    },
    resolveHost(host, credential, purpose = "openapi") {
      const profile = currentSources().file.aliyun_oauth;
      if (
        credential?.method === "aliyun-oauth" &&
        (!profile ||
          !profile[purpose === "console" ? "console_enabled" : "openapi_enabled"] ||
          profile.session_ref !== credential.sessionRef ||
          credential.configurationFingerprint !== oauthConfigurationFingerprint(profile))
      )
        throw new CredentialError(
          "missing-aliyun-session",
          "The OAuth login changed or was removed. / OAuth 登录已变更或被移除。",
        );
      if (pre) return resolvePreOpenApiHost(host);
      if (!profile?.[purpose === "console" ? "console_enabled" : "openapi_enabled"]) return host;
      if (
        /^modelstudio(?:\.[a-z0-9-]+)?\.aliyuncs\.com$/u.test(host) ||
        host === profile.modelstudio_host
      )
        return profile.modelstudio_host;
      if (/^bailiancontrol(?:\.[a-z0-9-]+)?\.aliyuncs\.com$/u.test(host)) {
        if (!profile.bailiancontrol_host)
          throw new UsageError(
            "Configure --bailiancontrol-host when signing in before calling BailianControl with this OAuth profile. / 使用此 OAuth 配置调用 BailianControl 前，请在登录时配置 --bailiancontrol-host。",
          );
        return profile.bailiancontrol_host;
      }
      return host;
    },
    async getCredential(purpose = "openapi") {
      const current = currentSources();
      const profile = selectedOAuth(current, purpose);
      if (!profile) return staticCredential(current);
      assertReference(profile, purpose);
      const cached = sessions.get(profile.session_ref);
      if (cached) assertOAuthConfiguration(profile, cached);
      if (cached?.sts && cached.sts.expiresAt > now() + 30_000 && !cached.refreshPending)
        return credentialFrom(profile, cached);
      const existing = pending.get(profile.session_ref);
      if (existing) return existing;
      const exchange = withFileLock(
        oauthSessionLockPath(directory, profile.session_ref),
        async () => {
          assertReference(profile, purpose);
          let session = parseOAuthSession(await getStore().read(profile.session_ref));
          assertOAuthConfiguration(profile, session);
          sessions.set(profile.session_ref, session);
          if (session.refreshPending)
            throw new CredentialError(
              "aliyun-refresh-uncertain",
              "The previous OAuth refresh did not finish safely; sign in again. / 上次 OAuth 刷新未安全完成，请重新登录。",
            );
          if (!session.sts || session.sts.expiresAt <= now() + 30_000) {
            if (session.accessTokenExpiresAt <= now() + 30_000) {
              if (!session.refreshToken)
                throw new CredentialError(
                  "missing-aliyun-session",
                  "No OAuth refresh token is available. / 没有可用的 OAuth 刷新令牌。",
                );
              session = { ...session, refreshPending: true };
              await save(profile, session);
              let tokens;
              try {
                tokens = await refreshAliyunTokens(profile, session.refreshToken, deps);
              } catch (error) {
                if (error instanceof BailianError && !error.hint && deps.recoveryHint)
                  throw new BailianError(error.message, error.exitCode, deps.recoveryHint, {
                    api: error.api,
                    cause: error.cause,
                  });
                throw error;
              }
              session = { ...session, ...tokens, refreshPending: false, sts: undefined };
              // A rotated RT must be durable before any dependent business request.
              await save(profile, session);
            }
            session = {
              ...session,
              sts: await exchangeAliyunSts(profile, session.accessToken, deps),
            };
            await save(profile, session);
            await mutateConfigFile(
              (file) => {
                if (
                  file.aliyun_oauth?.session_ref !== profile.session_ref ||
                  oauthConfigurationFingerprint(file.aliyun_oauth) !==
                    oauthConfigurationFingerprint(profile)
                )
                  return undefined;
                return {
                  ...file,
                  aliyun_oauth: {
                    ...file.aliyun_oauth,
                    access_token_expires_at: session.accessTokenExpiresAt,
                    sts_expires_at: session.sts!.expiresAt,
                  },
                };
              },
              sources.configName,
              { path: configurationPath },
            );
          }
          assertReference(profile, purpose);
          return credentialFrom(profile, session);
        },
      );
      pending.set(profile.session_ref, exchange);
      try {
        return await exchange;
      } finally {
        if (pending.get(profile.session_ref) === exchange) pending.delete(profile.session_ref);
      }
    },
    async getConsoleCredential(target) {
      const current = currentSources();
      const profile = current.file.aliyun_oauth;
      if (!profile?.console_enabled || hasCompleteCredentialOverride(current)) return undefined;
      validateTarget(profile, target);
      const scopedTarget = {
        region: target.region,
        site: target.site,
        ...(target.switchAgent !== undefined ? { switchAgent: target.switchAgent } : {}),
        gateway: profile.console_gateway,
      };
      let session = sessions.get(profile.session_ref);
      if (!session) {
        session = parseOAuthSession(await getStore().read(profile.session_ref));
        sessions.set(profile.session_ref, session);
      }
      assertReference(profile, "console");
      assertOAuthConfiguration(profile, session);
      const cached = session.consoleTokens?.[consoleCredentialKey(scopedTarget)];
      if (!cached || (cached.expiresAt !== undefined && cached.expiresAt <= now() + 30_000))
        return undefined;
      return {
        ...scopedTarget,
        token: cached.token,
        source: "config",
        method: "aliyun-oauth",
        sessionRef: profile.session_ref,
        configurationFingerprint: session.configurationFingerprint,
        ...(cached.expiresAt !== undefined ? { expiresAt: cached.expiresAt } : {}),
      };
    },
    async saveConsoleCredential(credential) {
      const profile = currentSources().file.aliyun_oauth;
      if (
        !profile?.console_enabled ||
        credential.method !== "aliyun-oauth" ||
        credential.source !== "config" ||
        credential.sessionRef !== profile.session_ref ||
        credential.configurationFingerprint !== oauthConfigurationFingerprint(profile)
      )
        return;
      validateTarget(profile, credential);
      await withFileLock(oauthSessionLockPath(directory, profile.session_ref), async () => {
        const current = currentSources().file.aliyun_oauth;
        if (
          !current ||
          current.session_ref !== credential.sessionRef ||
          !current.console_enabled ||
          credential.configurationFingerprint !== oauthConfigurationFingerprint(current)
        )
          return;
        const session = parseOAuthSession(await getStore().read(profile.session_ref));
        assertOAuthConfiguration(profile, session);
        const key = consoleCredentialKey({ ...credential, gateway: profile.console_gateway });
        await save(profile, {
          ...session,
          consoleTokens: {
            ...session.consoleTokens,
            [key]: {
              token: credential.token,
              ...(credential.expiresAt !== undefined ? { expiresAt: credential.expiresAt } : {}),
            },
          },
        });
      });
    },
  };
}
