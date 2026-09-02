import { parseFlags } from "./args.ts";
import { CommandRegistry } from "./registry.ts";
import { resolve } from "./resolve.ts";
import {
  compose,
  authStage,
  telemetryStage,
  versionCheckStage,
  confirmationStage,
  runCommandStage,
  type RunContext,
} from "./middleware.ts";
import type {
  AnyCommand,
  FlagsDef,
  Identity,
  LocalizedText,
  ParsedFlags,
  SourceFlags,
} from "bailian-cli-core";
import {
  CONSOLE_AUTH_FLAGS,
  DEFAULT_LANGUAGE,
  GLOBAL_FLAGS,
  MODEL_AUTH_FLAGS,
  OPENAPI_AUTH_FLAGS,
  UsageError,
  credentialFlagDefs,
  buildSources,
  buildSettings,
  describeAuthState,
  resolveModelBaseUrl,
  makeConfigStore,
  makeAuthStore,
  flushTelemetry,
  Client,
} from "bailian-cli-core";
import { setupProxyFromEnv } from "./proxy.ts";
import { handleError } from "./error-handler.ts";
import { loadCommandPacks } from "./command-packs/load.ts";
import { createCommandPackManager } from "./command-packs/manager.ts";
import type { CommandPackPolicy } from "./command-packs/types.ts";
import { createTranslator } from "./i18n.ts";
import { confirmationFlagDefs } from "./confirm.ts";

/** Per-product identity injected by each CLI entrypoint (bl / rag / …). */
export interface CliOptions {
  /** Binary name shown in help/usage/version output (e.g. "bl", "rag"). */
  binName: string;
  /** Product version for `--version` output, telemetry and update checks. */
  version: string;
  /** User-Agent / telemetry client name (e.g. "bailian-cli", "rag-cli")。必填,无默认。 */
  clientName: string;
  /** npm package name for self-update (e.g. "bailian-cli", "bailian-cli-rag"). */
  npmPackage: string;
  /** Root-help suggestions shown after credentials are configured. */
  quickStartTasks?: readonly string[];
  /** Command Packs accepted by this product. Omit when the product supports none. */
  commandPacks?: CommandPackPolicy;
}

export interface Cli {
  run(argv?: string[]): Promise<void>;
}

/** 从解析结果里挑出给定 key 的子集(全局/命令 flag 分流用)。 */
function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (key in obj) out[key] = obj[key];
  return out;
}

/** Read only the existing `--config` flag so locale follows the selected Profile before dispatch. */
function pickConfigFlag(argv: string[]): Partial<SourceFlags> {
  for (let argumentIndex = 0; argumentIndex < argv.length; argumentIndex++) {
    const argument = argv[argumentIndex];
    if (argument === "--config") {
      return { config: argv[argumentIndex + 1] };
    }
    if (argument?.startsWith("--config=")) {
      return { config: argument.slice("--config=".length) };
    }
  }
  return {};
}

/**
 * 进程级一次性设置：代理初始化、Ctrl+C、stdout EPIPE。
 * 属进程生命周期行为，装一次即可，不进 per-command 中间件。
 */
function installProcessHandlers(binName: string): void {
  try {
    setupProxyFromEnv();
  } catch (err) {
    handleError(err, binName);
  }

  // 处理 Ctrl+C
  process.on("SIGINT", () => {
    process.stderr.write("\nInterrupted. Exiting.\n");
    void flushTelemetry(500).finally(() => process.exit(130));
  });

  // 处理 stdout EPIPE（例如管道到提前退出的 `mpv`）
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EPIPE") process.exit(0);
    else throw e;
  });
}

/**
 * Build a CLI from an injected command set — each product (bl / rag / …) passes
 * its own commands + identity. `run` resolves argv into a {@link Resolution},
 * then dispatches it.
 */
export function createCli(commands: Record<string, AnyCommand>, opts: CliOptions): Cli {
  const { binName, version, npmPackage, clientName } = opts;
  const identity: Identity = { binName, version, npmPackage, clientName };
  const commandPackPolicy = opts.commandPacks ?? { supported: {} };
  const commandPackManager = createCommandPackManager(identity, commandPackPolicy);
  let loadedCommandPacksPromise: ReturnType<typeof loadCommandPacks> | undefined;

  installProcessHandlers(binName);

  const runMiddleware = compose([
    telemetryStage,
    confirmationStage,
    versionCheckStage,
    authStage,
    runCommandStage,
  ]);

  function getLoadedCommandPacks(): ReturnType<typeof loadCommandPacks> {
    if (!loadedCommandPacksPromise) {
      loadedCommandPacksPromise = loadCommandPacks(commands, identity, commandPackPolicy);
    }
    return loadedCommandPacksPromise;
  }

  async function getRegistry(argv: string[]): Promise<{
    registry: CommandRegistry;
    localize: (text: LocalizedText) => string;
  }> {
    const localeSources = buildSources(pickConfigFlag(argv));
    const translator = createTranslator(localeSources.file.language ?? DEFAULT_LANGUAGE);
    const loaded = await getLoadedCommandPacks();
    return {
      registry: new CommandRegistry(loaded.commands, binName, translator),
      localize: (text) => translator.localize(text),
    };
  }

  /** Render help for `path`; root ([]) doubles as the onboarding / login guide. */
  function renderHelp(registry: CommandRegistry, path: string[], argv: string[]): void {
    registry.printHelp(path, process.stderr);
    if (path.length > 0) return;

    let hasKey = false;
    try {
      const auth = describeAuthState(
        buildSources(
          parseFlags(argv, {
            ...GLOBAL_FLAGS,
            ...MODEL_AUTH_FLAGS,
            ...CONSOLE_AUTH_FLAGS,
            ...OPENAPI_AUTH_FLAGS,
          }) as Partial<SourceFlags>,
        ),
      );
      hasKey = !!(auth.apiKey || auth.console);
    } catch {
      /* unparseable global flags on the bare invocation — fall through to welcome */
    }
    if (hasKey) {
      if (opts.quickStartTasks?.length) registry.printQuickStart(opts.quickStartTasks);
    } else {
      registry.printWelcome();
    }
  }

  async function dispatch(
    registry: CommandRegistry,
    argv: string[],
    localize: (text: LocalizedText) => string,
  ): Promise<void> {
    const res = resolve(argv, registry);

    switch (res.kind) {
      case "version":
        process.stdout.write(`${binName} ${version}\n`);
        return;

      case "help":
        renderHelp(registry, res.path, argv);
        return;

      case "usageError":
        handleError(res.error, binName);
        return;

      case "run": {
        try {
          // 全局与凭证域 flag 进 sources,命令自有 flag 进 ctx.flags。
          const credDefs = credentialFlagDefs(res.command);
          const confirmationDefs = confirmationFlagDefs(res.command);
          const parsedFlags = parseFlags(res.rest, {
            ...GLOBAL_FLAGS,
            ...credDefs,
            ...confirmationDefs,
            ...res.command.flags,
          }) as Record<string, unknown>;
          const globalFlags = pick(parsedFlags, [
            ...Object.keys(GLOBAL_FLAGS),
            ...Object.keys(credDefs),
          ]) as Partial<SourceFlags>;
          const ownFlags = pick(
            parsedFlags,
            Object.keys(res.command.flags ?? {}),
          ) as ParsedFlags<FlagsDef>;
          const invalid = res.command.validate?.(ownFlags);
          if (invalid) throw new UsageError(invalid);

          // 校验通过 → 建源、解析 settings、组 ctx,进中间件执行命令。
          const sources = buildSources(globalFlags);
          const settings = buildSettings(sources);
          const ctx: RunContext = {
            identity,
            path: res.path,
            command: res.command,
            flags: ownFlags,
            confirmed: parsedFlags.yes === true,
            localize,
            settings,
            sources,
            configStore: makeConfigStore(sources.configName),
            authStore: makeAuthStore(sources),
            commandPacks: commandPackManager,
            client: new Client({
              identity,
              settings,
              baseUrl: resolveModelBaseUrl(sources),
            }),
          };
          await runMiddleware(ctx);
          await flushTelemetry(1000);
        } catch (err) {
          // 裸调用（命令后什么都没写）下的 UsageError → 当"还没写完"，打 help、exit 0；
          // 写了 flag 却无效、或执行时报错 → 报错、exit 2。
          if (err instanceof UsageError && res.rest.length === 0) {
            registry.printHelp(res.path, process.stderr);
            return;
          }
          await flushTelemetry(1000);
          handleError(err, binName);
        }
        return;
      }
    }
  }

  return {
    run(argv: string[] = process.argv.slice(2)) {
      return Promise.resolve()
        .then(() => getRegistry(argv))
        .then(({ registry, localize }) => dispatch(registry, argv, localize))
        .catch(
          (err) => flushTelemetry(1000).finally(() => handleError(err, binName)) as unknown as void,
        );
    },
  };
}
