import type {
  AnyCommand,
  ApiKeyCredential,
  AuthStore,
  ConfigStore,
  CommandPackManager,
  ConsoleCredential,
  CredentialSource,
  FlagsDef,
  Identity,
  OpenApiCredential,
  ParsedFlags,
  ResolutionSources,
  Settings,
  LocalizedText,
} from "bailian-cli-core";
import {
  getCommandPrefix,
  Client,
  DEFAULT_LANGUAGE,
  isModelConnectionSourceMismatch,
  resolveApiKey,
  resolveConsole,
  resolveOpenApi,
  readCaller,
  resolveModelBaseUrlState,
  resolveModelConnectionProvenance,
  selectApiKeyResolutionSources,
  trackCommandExecution,
} from "bailian-cli-core";
import { maybeShowStatusBar } from "./output/status-bar.ts";
import { ansi } from "./output/color.ts";
import { renderNoticeBox } from "./output/notice-box.ts";
import { createTranslator } from "./i18n.ts";
import {
  checkForUpdate,
  getPendingUpdateNotification,
  performAutoUpdate,
  shouldAutoUpdate,
} from "./utils/update-checker.ts";
import { ConfirmationRequiredError, confirmationHint } from "./confirm.ts";
import { prepareCommand } from "./preparation.ts";

/**
 * What each middleware stage gets for the invocation in flight: the matched
 * `command` with its `path`/`settings`/`flags`, and the `client` (populated by
 * {@link authStage}). A stage reads these and may augment them before `next()`.
 */
export interface RunContext {
  commandPath?: (command: AnyCommand) => string[] | undefined;
  prepared?: unknown;
  /** 静态产品身份(binName/version/npmPackage/clientName)。 */
  readonly identity: Identity;
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
  /** 配置持久化能力；lint 限定 commands/config/** 使用。 */
  configStore: ConfigStore;
  /** 鉴权持久化能力；lint 限定 commands/auth/** 使用。 */
  authStore: AuthStore;
  /** Command Pack 管理能力；lint 限定 commands/plugin/** 使用。 */
  commandPacks: CommandPackManager;
  /** Network surface with the credential baked in — set by {@link authStage}. */
  client: Client;
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
  if (ctx.settings.output === "json") {
    process.stderr.write(
      JSON.stringify(
        {
          warning: {
            code: "PROFILE_API_KEY_FALLBACK",
            message,
            profile: fallbackFrom,
            command_path: ctx.path,
            fallback_profile: "default",
            credential_fields: ["api_key", "base_url"],
          },
        },
        null,
        2,
      ) + "\n\n",
    );
    return;
  }
  process.stderr.write(`${message}\n`);
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
): { title: string; lines: string[]; message: string } {
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
  const title = translator.localize({ "en-US": "warning", "zh-CN": "警告" });
  const lines = translator
    .localize({
      "en-US": [
        "api_key and base_url are resolved from different sources.",
        `api_key ← ${apiKeyLabel}`,
        `base_url ← ${baseUrlLabel}`,
        "These may not match. The request will continue.",
        `Set both from the same source, or run ${getCommandPrefix(ctx.identity)} config show to view effective configuration.`,
      ].join("\n"),
      "zh-CN": [
        "api_key 和 base_url 来自不同配置源。",
        `api_key ← ${apiKeyLabel}`,
        `base_url ← ${baseUrlLabel}`,
        "两者可能不匹配，请求仍会继续。",
        `建议设为同一来源，或运行 ${getCommandPrefix(ctx.identity)} config show 查看生效配置。`,
      ].join("\n"),
    })
    .split("\n");
  return { title, lines, message: lines.join("\n") };
}

function writeModelConnectionMismatchNotice(
  ctx: RunContext,
  apiKeySource: CredentialSource,
  baseUrlSource: CredentialSource,
): void {
  const notice = formatModelConnectionMismatchNotice(ctx, apiKeySource, baseUrlSource);
  if (ctx.settings.output === "json") {
    process.stderr.write(
      JSON.stringify(
        {
          warning: {
            code: "API_KEY_BASE_URL_SOURCE_MISMATCH",
            message: notice.message,
            api_key_source: apiKeySource,
            base_url_source: baseUrlSource,
          },
        },
        null,
        2,
      ) + "\n\n",
    );
    return;
  }
  process.stderr.write(`${renderNoticeBox(notice.title, notice.lines)}\n`);
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
  const base = {
    identity: ctx.identity,
    settings,
    ...resolveModelBaseUrlState(sources),
  };
  if (command.auth === "apiKey") {
    const capability = ctx.path.join(".");
    const selection = selectApiKeyResolutionSources(sources, capability);
    const apiSources = selection.sources;
    if (selection.fallbackFrom && !settings.quiet) {
      writeApiKeyFallbackNotice(ctx, selection.fallbackFrom);
    }
    const provenance = resolveModelConnectionProvenance(apiSources);
    if (
      !settings.quiet &&
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
      if (!settings.dryRun || command.prepare) throw err;
    }
    ctx.client = new Client({
      ...base,
      ...resolveModelBaseUrlState(apiSources),
      apiCred: cred,
    });
    if (cred && !command.prepare) maybeShowStatusBar(settings, cred.token, cred);
  } else if (command.auth === "console") {
    let cred: ConsoleCredential | undefined;
    try {
      cred = resolveConsole(sources);
    } catch (err) {
      if (!settings.dryRun || command.prepare) throw err;
    }
    if (cred) ctx.client = new Client({ ...base, consoleCred: cred });
  } else if (command.auth === "openapi") {
    let cred: OpenApiCredential | undefined;
    try {
      cred = resolveOpenApi(sources);
    } catch (err) {
      if (!settings.dryRun || command.prepare) throw err;
    }
    ctx.client = new Client({ ...base, openApiCred: cred });
  }
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
  if (newVersion && !ctx.settings.quiet && !isUpdateCommand) {
    if (shouldAutoUpdate(newVersion, ctx.identity.version)) {
      // 大版本差距且目标为稳定版,自动更新
      await performAutoUpdate(
        ctx.identity.version,
        newVersion,
        ctx.identity.npmPackage,
        ctx.identity.clientName,
        getCommandPrefix(ctx.identity),
      );
    } else {
      const color = ansi(process.stderr);
      process.stderr.write(
        `\n  ${color.yellow(`Update available: ${ctx.identity.version} → ${newVersion}`)}\n`,
      );
      process.stderr.write(
        `  Run ${color.cyan(`${getCommandPrefix(ctx.identity)} update`)} to upgrade\n\n`,
      );
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
  if (await prepareCommand(ctx)) await ctx.command.run(ctx);
};
