import type { Identity, Settings } from "../config/schema.ts";
import type { ConsoleCredential, OpenApiCredential } from "../auth/types.ts";
import type { HttpDeps } from "./http.ts";
import { BailianError } from "../errors/base.ts";
import { CredentialError } from "../errors/credential.ts";
import { ExitCode } from "../errors/codes.ts";
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
  resolveConsoleOpenApiCredential?: () => OpenApiCredential;
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

/** Internal Console credential lifecycle; each instance owns its cache and in-flight exchange. */
export class ConsoleSession {
  private consoleTokenPersisted: boolean;
  private consoleRefresh?: ConsoleTokenRefresh;

  constructor(private readonly deps: ConsoleSessionOptions) {
    this.consoleTokenPersisted = deps.consoleCred?.source === "config";
  }

  /** 创建仅本次调用链使用的 Console 身份；不修改原 Client、Settings 或持久化配置。 */
  withSwitchAgent(switchAgent: number): ConsoleSession {
    const session = new ConsoleSession({
      ...this.deps,
      settings: { ...this.deps.settings, consoleSwitchAgent: switchAgent },
      consoleCred: this.deps.consoleCred ? { ...this.deps.consoleCred, switchAgent } : undefined,
    });
    session.consoleTokenPersisted = this.consoleTokenPersisted;
    return session;
  }

  async request<T>(api: string, data: Record<string, unknown>): Promise<T> {
    const credential = this.deps.consoleCred;
    if (!credential) {
      const failure = new BailianError("This command needs a console access token.", ExitCode.AUTH);
      if (!this.deps.resolveConsoleOpenApiCredential) throw failure;
      return this.refreshConsole<T>(api, data, failure);
    }
    try {
      return await this.requestConsole<T>(credential, api, data);
    } catch (error) {
      if (!(error instanceof CredentialError) || error.reason !== "expired-console-session")
        throw error;
      return this.refreshConsole<T>(api, data, error, credential);
    }
  }

  private async requestConsole<T>(
    credential: ConsoleCredential,
    api: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    return (await callConsoleGateway(
      credential,
      this.deps.settings.timeout,
      { api, data },
      {
        debug: this.deps.debug,
        recoveryHint: this.deps.consoleRecoveryHint,
      },
    )) as T;
  }

  /** Share issuance only; every caller retries and validates its own business request. */
  private async refreshConsole<T>(
    api: string,
    data: Record<string, unknown>,
    failure: BailianError,
    previous?: ConsoleCredential,
  ): Promise<T> {
    if (this.deps.consoleCred && this.deps.consoleCred !== previous)
      return this.requestConsole<T>(this.deps.consoleCred, api, data);

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
      const result = await this.requestConsole<T>(exchange.credential, api, data);
      refresh.commit ??= (async () => {
        if (this.deps.consoleCred !== previous) return;
        if (exchange.persist)
          await persistConsoleAccessToken(exchange.credential.token, this.deps.settings.configName);
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
    const credential = this.deps.resolveConsoleOpenApiCredential?.();
    const target = previous ?? resolveCLIAccessTokenTarget(this.deps.settings, this.deps.baseUrl);
    const persist =
      this.consoleTokenPersisted &&
      previous?.source === "config" &&
      (!credential || credential.source === "config");
    const token = await refreshAccessToken({
      identity: this.deps.identity,
      settings: {
        ...this.deps.settings,
        consoleRegion: target.region,
        consoleSite: target.site,
        consoleSwitchAgent: target.switchAgent,
      },
      debug: this.deps.debug,
      baseUrl: this.deps.baseUrl,
      credential,
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
      },
      persist,
    };
  }
}
