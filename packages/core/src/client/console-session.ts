import type { Identity, Settings } from "../config/schema.ts";
import type { ConsoleCredential, OpenApiCredential } from "../auth/types.ts";
import type { OpenApiCredentialProvider } from "../auth/aliyun-types.ts";
import type { HttpDeps } from "./http.ts";
import { BailianError } from "../errors/base.ts";
import { CredentialError } from "../errors/credential.ts";
import { ExitCode } from "../errors/codes.ts";
import { getConfigPath } from "../config/paths.ts";
import { requirePreConsoleGateway } from "../config/control-plane.ts";
import { callConsoleGateway } from "../console/gateway.ts";
import {
  persistConsoleAccessToken,
  refreshAccessToken,
  resolveCLIAccessTokenTarget,
} from "../auth/refresh-token.ts";

interface ConsoleSessionOptions {
  identity: Identity;
  settings: Settings;
  baseUrl: string;
  debug?: HttpDeps["debug"];
  consoleCred?: ConsoleCredential;
  resolveConsoleOpenApiCredential?: () => OpenApiCredential | Promise<OpenApiCredential>;
  openApiProvider?: OpenApiCredentialProvider;
  consoleRecoveryHint?: string;
}

interface ConsoleTokenExchange {
  credential: ConsoleCredential;
  persist: boolean;
}

interface ConsoleTokenRefresh {
  previous?: ConsoleCredential;
  promise: Promise<ConsoleTokenExchange | null>;
  users: number;
  commit?: Promise<void>;
}

function assertSameConsoleIdentity(
  previous?: ConsoleCredential,
  next?: Pick<OpenApiCredential, "method" | "sessionRef" | "configurationFingerprint">,
): void {
  if (!previous || (previous.method !== "aliyun-oauth" && next?.method !== "aliyun-oauth")) return;
  if (
    previous.method !== next?.method ||
    !previous.sessionRef ||
    previous.sessionRef !== next?.sessionRef ||
    !previous.configurationFingerprint ||
    previous.configurationFingerprint !== next?.configurationFingerprint
  )
    throw new CredentialError(
      "changed-openapi-identity",
      "The Console identity changed during the request. / 请求期间控制台身份已变更。",
    );
}

/** Internal Console credential lifecycle; each instance owns its cache and in-flight exchange. */
export class ConsoleSession {
  private consoleTokenPersisted: boolean;
  private consoleRefresh?: ConsoleTokenRefresh;
  private readonly configurationPath: string;

  constructor(private readonly deps: ConsoleSessionOptions) {
    this.configurationPath =
      deps.settings.configPath ?? getConfigPath(deps.settings.preControlPlane);
    this.consoleTokenPersisted = deps.consoleCred?.source === "config";
  }

  /** 创建仅本次调用链使用的 Console 身份；不修改原 Client、Settings 或持久化配置。 */
  withSwitchAgent(switchAgent: number): ConsoleSession {
    const session = new ConsoleSession({
      ...this.deps,
      settings: {
        ...this.deps.settings,
        configPath: this.configurationPath,
        consoleSwitchAgent: switchAgent,
      },
      consoleCred: this.deps.consoleCred ? { ...this.deps.consoleCred, switchAgent } : undefined,
    });
    session.consoleTokenPersisted = this.consoleTokenPersisted;
    return session;
  }

  async request<T>(api: string, data: Record<string, unknown>): Promise<T> {
    const { settings, consoleCred } = this.deps;
    const pre = settings.preControlPlane;
    if (pre && (consoleCred || this.deps.resolveConsoleOpenApiCredential)) {
      requirePreConsoleGateway(pre, {
        region: consoleCred?.region ?? settings.consoleRegion,
        site: consoleCred?.site ?? settings.consoleSite,
      });
    }
    return this.dispatch<T>(
      (credential) =>
        callConsoleGateway(
          credential,
          this.deps.settings.timeout,
          { api, data },
          {
            debug: this.deps.debug,
            recoveryHint: this.deps.consoleRecoveryHint,
            preControlPlane: pre,
          },
        ) as Promise<T>,
    );
  }

  /** Shared credential lifecycle: lazy issuance and expired-session refresh. */
  private async dispatch<T>(invoke: (credential: ConsoleCredential) => Promise<T>): Promise<T> {
    if (
      this.deps.openApiProvider &&
      (!this.deps.consoleCred || this.deps.consoleCred.method === "aliyun-oauth")
    ) {
      const target =
        this.deps.consoleCred ?? resolveCLIAccessTokenTarget(this.deps.settings, this.deps.baseUrl);
      const cached = await this.deps.openApiProvider.getConsoleCredential(target);
      if (
        !cached ||
        cached.token !== this.deps.consoleCred?.token ||
        cached.gateway !== this.deps.consoleCred?.gateway ||
        cached.sessionRef !== this.deps.consoleCred?.sessionRef ||
        cached.configurationFingerprint !== this.deps.consoleCred?.configurationFingerprint
      )
        this.deps.consoleCred = cached;
    }
    const credential = this.deps.consoleCred;
    if (!credential) {
      const failure = new BailianError("This command needs a console access token.", ExitCode.AUTH);
      if (!this.deps.resolveConsoleOpenApiCredential) throw failure;
      return this.refreshConsole<T>(invoke, failure);
    }
    try {
      return await invoke(credential);
    } catch (error) {
      if (!(error instanceof CredentialError) || error.reason !== "expired-console-session")
        throw error;
      return this.refreshConsole<T>(invoke, error, credential);
    }
  }

  /** Share issuance only; every caller retries and validates its own business request. */
  private async refreshConsole<T>(
    invoke: (credential: ConsoleCredential) => Promise<T>,
    failure: BailianError,
    previous?: ConsoleCredential,
  ): Promise<T> {
    const retry = (credential: ConsoleCredential) => {
      assertSameConsoleIdentity(previous, credential);
      if (credential.method === "aliyun-oauth")
        this.deps.openApiProvider?.resolveConsoleTarget(credential);
      return invoke(credential);
    };
    if (this.deps.consoleCred && this.deps.consoleCred !== previous)
      return retry(this.deps.consoleCred);

    let refresh = this.consoleRefresh;
    if (!refresh || refresh.previous !== previous) {
      refresh = { previous, promise: this.exchangeConsoleToken(previous), users: 0 };
      this.consoleRefresh = refresh;
    }
    refresh.users++;
    try {
      const exchange = await refresh.promise.catch((error: unknown) => {
        if (error instanceof CredentialError && error.reason === "missing-openapi-pair")
          throw failure;
        throw error;
      });
      if (!exchange) throw failure;
      const result = await retry(exchange.credential);
      refresh.commit ??= (async () => {
        if (this.deps.consoleCred !== previous) return;
        if (exchange.persist) {
          if (exchange.credential.method === "aliyun-oauth")
            await this.deps.openApiProvider?.saveConsoleCredential(exchange.credential);
          else
            await persistConsoleAccessToken(
              exchange.credential.token,
              this.deps.settings.configName,
              this.configurationPath,
              previous ? { token: previous.token } : undefined,
            );
        }
        this.consoleTokenPersisted = exchange.persist;
        this.deps.consoleCred = exchange.credential;
      })();
      await refresh.commit;
      return result;
    } finally {
      refresh.users--;
      if (refresh.users === 0 && this.consoleRefresh === refresh) this.consoleRefresh = undefined;
    }
  }

  private async exchangeConsoleToken(
    previous?: ConsoleCredential,
  ): Promise<ConsoleTokenExchange | null> {
    if (previous?.method === "aliyun-oauth")
      this.deps.openApiProvider?.resolveConsoleTarget(previous);
    const credential = await this.deps.resolveConsoleOpenApiCredential?.();
    assertSameConsoleIdentity(previous, credential);
    const unresolvedTarget = previous
      ? {
          region: previous.region,
          site: previous.site,
          ...(previous.switchAgent !== undefined ? { switchAgent: previous.switchAgent } : {}),
          ...(previous.gateway !== undefined ? { gateway: previous.gateway } : {}),
        }
      : resolveCLIAccessTokenTarget(this.deps.settings, this.deps.baseUrl);
    const target =
      this.deps.openApiProvider?.resolveConsoleTarget(unresolvedTarget) ?? unresolvedTarget;
    const persist =
      credential?.method === "aliyun-oauth" ||
      (this.consoleTokenPersisted &&
        previous?.source === "config" &&
        (!credential || credential.source === "config"));
    const token = await refreshAccessToken({
      identity: this.deps.identity,
      settings: {
        ...this.deps.settings,
        configPath: this.configurationPath,
        consoleRegion: target.region,
        consoleSite: target.site,
        consoleSwitchAgent: target.switchAgent,
      },
      debug: this.deps.debug,
      baseUrl: this.deps.baseUrl,
      credential,
      modelStudioHost: this.deps.openApiProvider?.resolveHost(
        `modelstudio.${target.region}.aliyuncs.com`,
        credential,
        "console",
      ),
      persist: false,
      // Each waiting caller validates by executing its own business request.
      validateToken: async () => {},
    });
    if (!token) return null;
    return {
      credential: {
        ...target,
        token,
        source: credential?.source ?? previous?.source ?? "config",
        ...(credential?.method === "aliyun-oauth"
          ? {
              method: "aliyun-oauth" as const,
              sessionRef: credential.sessionRef,
              configurationFingerprint: credential.configurationFingerprint,
            }
          : {}),
      },
      persist,
    };
  }
}
