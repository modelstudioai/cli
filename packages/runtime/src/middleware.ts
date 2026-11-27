import { consoleRecoveryHint, aliyunRecoveryHint } from "./error-handler.ts";
import type {
  AnyCommand,
  CommandOutput,
  ApiKeyCredential,
  AuthStore,
  ConfigStore,
  CommandPackManager,
  ConsoleCredential,
  CredentialSource,
  FlagsDef,
  Identity,
  ParsedFlags,
  ResolutionSources,
  Settings,
  LocalizedText,
} from "bailian-cli-core";
import {
  CredentialError,
  formatCommand,
  Client,
  createRequestSignals,
  DEFAULT_LANGUAGE,
  isModelConnectionSourceMismatch,
  resolveApiKey,
  resolveConsole,
  createOpenApiCredentialProvider,
  bindOpenApiConsoleCredentials,
  readCaller,
  requirePreConsoleGateway,
  resolveModelBaseUrlState,
  resolveModelConnectionProvenance,
  resolveRecoveryConfigName,
  resolveTelemetrySite,
  selectApiKeyResolutionSources,
  trackCommandExecution,
} from "bailian-cli-core";
import { maybeShowStatusBar } from "./output/status-bar.ts";
import { createTranslator } from "./i18n.ts";
import {
  checkForUpdate,
  getPendingUpdateNotification,
  performAutoUpdate,
  shouldAutoUpdate,
} from "./utils/update-checker.ts";
import { ConfirmationRequiredError, confirmationHint } from "./confirm.ts";
import { runPreparedCommand } from "./preparation.ts";

/**
 * What each middleware stage gets for the invocation in flight: the matched
 * `command` with its `path`/`settings`/`flags`, and the `client` (populated by
 * {@link authStage}). A stage reads these and may augment them before `next()`.
 */
export interface RunContext {
  hasCommand?: (path: string) => boolean;
  commandPath?: (command: AnyCommand) => string[] | undefined;
  prepared?: unknown;
  /** 静态产品身份(binName/version/npmPackage/clientName)。 */
  readonly identity: Identity;
  readonly output: CommandOutput;
  /** The matched command path, e.g. ["speech","recognize"]. */
  readonly path: string[];
  readonly command: AnyCommand;
  /** 只含本命令声明的 flag(分流后);全局 flag 在 sources/settings。 */
  flags: ParsedFlags<FlagsDef>;
  /** Whether the runtime-owned --yes flag was explicitly supplied. */
  readonly confirmed: boolean;
  /** Locale selector for runtime-owned command metadata and messages. */
  readonly localize: (text: LocalizedText) => string;
  /** 解析后的有效配置面(命令的新读取面;双轨迁移期与 config 并存)。 */
  settings: Settings;
  /** 解析源:provider/访问器用;业务命令不可见(窄视图类型不含此字段)。 */
  sources: ResolutionSources;
  /** Optional pre-release Console sources for a model command. Missing means no Console auth. */
  controlSources?: ResolutionSources;
  /** 配置持久化能力；lint 限定 commands/config/** 使用。 */
  configStore: ConfigStore;
  /** 鉴权持久化能力；lint 限定 commands/auth/** 使用。 */
  authStore: AuthStore;
  /** Command Pack 管理能力；lint 限定 commands/plugin/** 使用。 */
  commandPacks: CommandPackManager;
  /** Network surface with the credential baked in — set by {@link authStage}. */
  client: Client;
  /** Rewrite the profile pinned in runtime recovery hints (API Key fallback). */
  setRecoveryConfigName?: (name: string | undefined) => void;
}

/** Koa-style onion middleware: do work, call `next()`, do work after it returns. */
export type Middleware = (ctx: RunContext, next: () => Promise<void>) => Promise<void>;

function formatApiKeyFallbackNotice(
  ctx: RunContext,
  fallbackFrom: string,
  commandPath: string,
): string {
  const translator = createTranslator(ctx.sources.file.language ?? DEFAULT_LANGUAGE);
  return translator.localize({
    "en-US": `Profile "${fallbackFrom}" does not support command "${commandPath}"; API Key settings will be read from Profile "default" for this run.`,
    "zh-CN": `Profile "${fallbackFrom}" 不支持命令 "${commandPath}"，本次将从 Profile "default" 读取 API Key 配置。`,
  });
}

function writeApiKeyFallbackNotice(ctx: RunContext, fallbackFrom: string): void {
  const commandPath = ctx.path.join(" ");
  const message = formatApiKeyFallbackNotice(ctx, fallbackFrom, commandPath);
  ctx.output.warning({
    code: "PROFILE_API_KEY_FALLBACK",
    message,
    details: {
      profile: fallbackFrom,
      command_path: ctx.path,
      fallback_profile: "default",
      credential_fields: ["api_key", "base_url"],
    },
  });
}

function describeCredentialSourceLabel(
  field: "api_key" | "base_url",
  source: CredentialSource,
  configPath: string,
  language: "en-US" | "zh-CN",
): string {
  if (source === "flag") {
    return field === "api_key" ? "--api-key" : "--base-url";
  }
  if (source === "env") {
    const envName = field === "api_key" ? "DASHSCOPE_API_KEY" : "DASHSCOPE_BASE_URL";
    return language === "zh-CN" ? `环境变量 (${envName})` : `env (${envName})`;
  }
  return language === "zh-CN" ? `配置文件 (${configPath})` : `config (${configPath})`;
}

function formatModelConnectionMismatchNotice(
  ctx: RunContext,
  apiKeySource: CredentialSource,
  baseUrlSource: CredentialSource,
): string {
  const language = ctx.sources.file.language ?? DEFAULT_LANGUAGE;
  const translator = createTranslator(language);
  const configPath = ctx.sources.configPath ?? ctx.settings.configPath ?? "~/.bailian/config.json";
  const apiKeyLabel = describeCredentialSourceLabel("api_key", apiKeySource, configPath, language);
  const baseUrlLabel = describeCredentialSourceLabel(
    "base_url",
    baseUrlSource,
    configPath,
    language,
  );
  return translator.localize({
    "en-US": [
      "api_key and base_url are resolved from different sources.",
      `api_key ← ${apiKeyLabel}`,
      `base_url ← ${baseUrlLabel}`,
      "These may not match. The request will continue.",
      `Set both from the same source, or run ${formatCommand(ctx.identity, "config show")} to view effective configuration.`,
    ].join("\n"),
    "zh-CN": [
      "api_key 和 base_url 来自不同配置源。",
      `api_key ← ${apiKeyLabel}`,
      `base_url ← ${baseUrlLabel}`,
      "两者可能不匹配，请求仍会继续。",
      `建议设为同一来源，或运行 ${formatCommand(ctx.identity, "config show")} 查看生效配置。`,
    ].join("\n"),
  });
}

function writeModelConnectionMismatchNotice(
  ctx: RunContext,
  apiKeySource: CredentialSource,
  baseUrlSource: CredentialSource,
): void {
  ctx.output.warning({
    code: "API_KEY_BASE_URL_SOURCE_MISMATCH",
    message: formatModelConnectionMismatchNotice(ctx, apiKeySource, baseUrlSource),
    details: { api_key_source: apiKeySource, base_url_source: baseUrlSource },
  });
}

/** Fold a middleware list into a single runnable function. */
export function compose(stack: Middleware[]): (ctx: RunContext) => Promise<void> {
  return (ctx) => {
    const dispatch = (i: number): Promise<void> => {
      const mw = stack[i];
      if (!mw) return Promise.resolve();
      return mw(ctx, () => dispatch(i + 1));
    };
    return dispatch(0);
  };
}

/**
 * Bake the credential for the command's declared `auth` into `ctx.client`, and
 * gate: no credential → throw before the command runs. dry-run 例外:凭证解析失败
 * 不抛(dry-run 只打印请求,无需凭证;console 的 dry-run 展示读 settings.console*)。
 * `auth: "none"` commands keep a credential-less client.
 */
export const authStage: Middleware = async (ctx, next) => {
  const { command, settings, sources } = ctx;
  const debug = (diagnostic: Parameters<CommandOutput["debug"]>[0]) => ctx.output.debug(diagnostic);
  const controlRecoveryConfigName = (controlSources: ResolutionSources) =>
    controlSources === sources
      ? settings.recoveryConfigName
      : resolveRecoveryConfigName(controlSources);
  const createProvider = (controlSources: ResolutionSources) =>
    createOpenApiCredentialProvider(controlSources, {
      identity: ctx.identity,
      timeout: settings.timeout,
      debug,
      recoveryHint: ctx.hasCommand?.("auth")
        ? aliyunRecoveryHint(
            formatCommand(ctx.identity),
            controlRecoveryConfigName(controlSources),
            ctx.localize,
          )
        : ctx.localize({
            "en-US": "Use the CLI that manages this profile to sign in to Aliyun again.",
            "zh-CN": "请使用管理此配置的 CLI 重新登录阿里云。",
          }),
    });
  // Console credentials do not fall back; keep the selected control profile pin.
  const controlRecoveryHint = (controlSources: ResolutionSources) =>
    consoleRecoveryHint(
      formatCommand(ctx.identity),
      controlRecoveryConfigName(controlSources),
      Boolean(controlSources.file.aliyun_oauth?.console_enabled && ctx.hasCommand?.("auth")),
      ctx.localize,
    );
  const base = {
    identity: ctx.identity,
    settings,
    requestSignals: createRequestSignals(),
    consoleRecoveryHint:
      settings.preControlPlane && command.auth === "apiKey"
        ? undefined
        : controlRecoveryHint(sources),
    debug,
    ...resolveModelBaseUrlState(sources),
  };
  const apiKeyRequirement = command.requiresApiKey?.(ctx.flags) ?? true;
  if (command.auth === "apiKey" && apiKeyRequirement) {
    // Commands whose network target switches with a flag declare authCapability
    // so Profile selection follows the actual connection; others key off path.
    const capability = command.authCapability
      ? command.authCapability(ctx.flags)
      : ctx.path.join(".");
    const selection = selectApiKeyResolutionSources(sources, capability);
    const apiSources = selection.sources;
    if (selection.fallbackFrom) {
      writeApiKeyFallbackNotice(ctx, selection.fallbackFrom);
      // API Key now comes from default; recovery commands must pin default, not
      // the profile that was selected and then bypassed.
      ctx.setRecoveryConfigName?.("default");
    }
    const provenance = resolveModelConnectionProvenance(apiSources);
    if (
      isModelConnectionSourceMismatch(provenance) &&
      provenance.apiKeySource &&
      provenance.baseUrlSource
    ) {
      writeModelConnectionMismatchNotice(ctx, provenance.apiKeySource, provenance.baseUrlSource);
    }
    let cred: ApiKeyCredential | undefined;
    try {
      cred = resolveApiKey(apiSources);
    } catch (err) {
      const optionalMissing =
        apiKeyRequirement === "optional" &&
        err instanceof CredentialError &&
        err.reason === "missing-api-key";
      if (!optionalMissing && (!settings.dryRun || command.prepare)) throw err;
    }
    const apiClientDeps = { ...base, ...resolveModelBaseUrlState(apiSources), apiCred: cred };
    ctx.client = new Client(apiClientDeps);
    // In pre-release mode never fall back from an unavailable Console source to
    // the model Profile, even when that Profile has valid Console credentials.
    const controlSources = settings.preControlPlane ? ctx.controlSources : sources;
    if (command.optionalConsole && controlSources) {
      try {
        if (settings.preControlPlane) {
          requirePreConsoleGateway(settings.preControlPlane, {
            region: settings.consoleRegion,
            site: settings.consoleSite,
          });
        }
        let consoleCred: ConsoleCredential | undefined;
        try {
          consoleCred = resolveConsole(controlSources);
        } catch {
          /* An OAuth profile or static AK/SK may still supply a Console session. */
        }
        const provider =
          settings.preControlPlane ||
          (!consoleCred && controlSources.file.aliyun_oauth?.console_enabled)
            ? createProvider(controlSources)
            : undefined;
        if (!consoleCred) provider?.assertAvailable("console");
        if (consoleCred || provider) {
          ctx.client = new Client({
            ...apiClientDeps,
            settings:
              controlSources === sources
                ? settings
                : {
                    ...settings,
                    // Console refresh must persist only to the selected pre-release Profile.
                    configPath: controlSources.configPath,
                    configName: controlSources.configName,
                    recoveryConfigName: controlRecoveryConfigName(controlSources),
                  },
            consoleRecoveryHint: controlRecoveryHint(controlSources),
            consoleCred,
            ...(provider
              ? {
                  openApiProvider: provider,
                  resolveConsoleOpenApiCredential: () => provider.getCredential("console"),
                }
              : {}),
          });
        }
      } catch {
        if (settings.preControlPlane) {
          ctx.output.warning({
            code: "PRE_CONSOLE_UNAVAILABLE",
            message: {
              "en-US": "Pre-release Console is unavailable; continuing with the model API only.",
              "zh-CN": "预发控制台不可用，将仅通过模型 API 继续执行。",
            },
          });
        }
      }
    }
    if (cred && !command.prepare) maybeShowStatusBar(settings, cred.token, cred, ctx.output);
  } else if (command.auth === "console") {
    if (settings.preControlPlane && (!settings.dryRun || command.prepare)) {
      requirePreConsoleGateway(settings.preControlPlane, {
        region: settings.consoleRegion,
        site: settings.consoleSite,
      });
    }
    const provider = createProvider(sources);
    let cred: ConsoleCredential | undefined;
    try {
      cred = resolveConsole(sources);
    } catch (error) {
      try {
        provider.assertAvailable("console");
      } catch (credentialError) {
        if (!settings.dryRun || command.prepare) {
          throw credentialError instanceof CredentialError &&
            credentialError.reason === "missing-openapi-pair"
            ? error
            : credentialError;
        }
      }
    }
    ctx.client = new Client({
      ...base,
      consoleCred: cred,
      openApiProvider: provider,
      resolveConsoleOpenApiCredential: () => provider.getCredential("console"),
    });
  } else if (command.auth === "openapi") {
    const provider = createProvider(sources);
    try {
      provider.assertAvailable();
    } catch (error) {
      if (!settings.dryRun || command.prepare) throw error;
    }
    const boundProvider = bindOpenApiConsoleCredentials(provider);
    ctx.client = new Client({
      ...base,
      settings: {
        ...settings,
        consoleRegion: settings.consoleRegion ?? "cn-beijing",
        consoleSite: settings.consoleSite ?? "domestic",
      },
      openApiProvider: boundProvider,
      resolveConsoleOpenApiCredential: () => boundProvider.getCredential(),
    });
  }
  const defaultOrigin = command.defaultApiBaseUrl;
  if (defaultOrigin) ctx.client = ctx.client.withDefaultBaseUrl(() => defaultOrigin(ctx));
  await next();
};

/** Record command execution (start / success / failure) around the command. */
export const telemetryStage: Middleware = (ctx, next) => {
  return trackCommandExecution(
    {
      identity: ctx.identity,
      settings: ctx.settings,
      authMethod: ctx.command.auth,
      caller: readCaller(process.env),
      resolveSite: () =>
        resolveTelemetrySite({
          auth: ctx.command.auth,
          consoleSite: ctx.settings.consoleSite,
          productSite: ctx.client.productSite,
          lastResolvedOrigin: ctx.client.lastResolvedOrigin,
          baseUrl: ctx.client.baseUrl,
          baseUrlIsDefault: ctx.client.baseUrlIsDefault,
        }),
    },
    ctx.path,
    ctx.flags,
    next,
  );
};

/**
 * Kick off a debounced update check before the command, then — only on success
 * — surface any pending notification. Never affects the command's exit code:
 * if `next()` throws, the notice is skipped (no update nag on failure).
 */
export const versionCheckStage: Middleware = async (ctx, next) => {
  // Planning and explicitly disabled update checks must not trigger background writes.
  if (ctx.command.prepare || process.env.NO_UPDATE_NOTIFIER === "1") {
    await next();
    return;
  }
  const pending = checkForUpdate(
    ctx.identity.version,
    ctx.identity.npmPackage,
    ctx.identity.clientName,
  ).catch(() => {});
  await next();
  await pending;

  const isUpdateCommand = ctx.path.length === 1 && ctx.path[0] === "update";
  const newVersion = getPendingUpdateNotification();
  if (newVersion && !isUpdateCommand) {
    if (shouldAutoUpdate(newVersion, ctx.identity.version)) {
      // 大版本差距且目标为稳定版,自动更新
      await performAutoUpdate(
        ctx.identity.version,
        newVersion,
        ctx.identity.npmPackage,
        ctx.identity.clientName,
        {
          output: ctx.output,
          binName: ctx.identity.binName,
          ...(ctx.identity.commandInvocation ? { commandPrefix: formatCommand(ctx.identity) } : {}),
        },
      );
    } else {
      ctx.output.warning({
        code: "UPDATE_AVAILABLE",
        message: {
          "en-US": `Update available: ${ctx.identity.version} → ${newVersion}. Run ${formatCommand(ctx.identity, "update")} to upgrade.`,
          "zh-CN": `发现新版本：${ctx.identity.version} → ${newVersion}。运行 ${formatCommand(ctx.identity, "update")} 升级。`,
        },
        details: {
          current_version: ctx.identity.version,
          latest_version: newVersion,
          upgrade_command: `${formatCommand(ctx.identity, "update")}`,
        },
      });
    }
  }
};

/**
 * Safety gate before update/auth/command stages. Telemetry may wrap this stage
 * so confirmation-required failures remain observable.
 */
export const confirmationStage: Middleware = async (ctx, next) => {
  if (
    ctx.command.prepare ||
    ctx.command.risk === undefined ||
    ctx.confirmed ||
    ctx.settings.dryRun
  ) {
    await next();
    return;
  }

  throw new ConfirmationRequiredError({
    message: ctx.localize(ctx.command.risk.message),
    hint: ctx.localize(confirmationHint()),
  });
};

/** Innermost stage: hand control to the command with its full context. */
export const runCommandStage: Middleware = async (ctx) => {
  await runPreparedCommand(ctx);
};
