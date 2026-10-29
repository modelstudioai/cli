import { CommandRegistry } from "./registry.ts";
import { resolve } from "./resolve.ts";
import { buildCommandSchema, serializeCommandSchema } from "./introspect.ts";
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
  Settings,
  ResolutionSources,
  OutputDiagnostic,
} from "bailian-cli-core";
import {
  DEFAULT_LANGUAGE,
  BailianError,
  ExitCode,
  GLOBAL_FLAGS,
  UsageError,
  credentialFlagDefs,
  buildSources,
  buildSettings,
  buildOutputSettings,
  describeAuthState,
  resolveModelBaseUrlState,
  makeConfigStore,
  makeAuthStore,
  flushTelemetry,
  Client,
} from "bailian-cli-core";
import { setupProxyFromEnv } from "./proxy.ts";
import { handleError } from "./error-handler.ts";
import { type OutputReporter, createOutputReporter } from "./output/reporter.ts";
import { loadCommandPacks } from "./command-packs/load.ts";
import { createCommandPackManager } from "./command-packs/manager.ts";
import type { CommandPackPolicy } from "./command-packs/types.ts";
import { createTranslator } from "./i18n.ts";

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

/** Tolerant, read-only presentation flags for failures before full parsing. */
function presentationFlags(argv: string[]): Partial<SourceFlags> {
  const flags: Partial<SourceFlags> = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--") break;
    if (argument === "--quiet") flags.quiet = true;
    else if (argument === "--verbose") flags.verbose = true;
    else
      for (const key of ["output", "config"] as const) {
        if (argument.startsWith(`--${key}=`)) flags[key] = argument.slice(key.length + 3);
        else if (argument === `--${key}`) {
          const value = argv[index + 1];
          if (value !== undefined && !value.startsWith("--")) {
            flags[key] = value;
            index++;
          }
        }
      }
  }
  return flags;
}

interface ProcessOutputContext {
  getReporter: () => OutputReporter;
  localize: (text: LocalizedText) => string;
}

const activeProcessOutputs = new Set<ProcessOutputContext>();
const managedInterruptHandlers = new Set<() => void>();

/** Let a command cancel asynchronous work and finish cleanup before the runtime exits. */
export function registerInterruptHandler(handler: () => void): () => void {
  const listener = () => handler();
  managedInterruptHandlers.add(listener);
  process.on("SIGINT", listener);
  return () => {
    managedInterruptHandlers.delete(listener);
    process.removeListener("SIGINT", listener);
  };
}

/** One process event produces one error, using the first still-active invocation. */
function handleInterrupt(): void {
  if (managedInterruptHandlers.size > 0) return;
  const active = activeProcessOutputs.values().next().value;
  if (!active) return;
  active
    .getReporter()
    .error(
      new BailianError(
        active.localize({ "en-US": "Interrupted. Exiting.", "zh-CN": "操作已中断，正在退出。" }),
        130 as ExitCode,
      ),
    );
  void flushTelemetry(500).finally(() => process.exit(130));
}

/** Keep EPIPE protection after run() returns, without retaining completed invocations. */
function handleStdoutPipeError(error: NodeJS.ErrnoException): void {
  if (error.code === "EPIPE") process.exit(0);
  const active = activeProcessOutputs.values().next().value;
  if (active) process.exit(active.getReporter().error(error));
  // Outside an invocation, let other listeners handle errors or retain Node's failure behavior.
  if (process.stdout.listenerCount("error") === 1) throw error;
}

function installProcessHandlers(
  getReporter: () => OutputReporter,
  localize: (text: LocalizedText) => string,
): () => void {
  if (!process.stdout.listeners("error").includes(handleStdoutPipeError)) {
    process.stdout.on("error", handleStdoutPipeError);
  }
  if (activeProcessOutputs.size === 0) process.on("SIGINT", handleInterrupt);
  const context = { getReporter, localize };
  activeProcessOutputs.add(context);
  return () => {
    activeProcessOutputs.delete(context);
    if (activeProcessOutputs.size === 0) process.removeListener("SIGINT", handleInterrupt);
  };
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

  async function getRegistry(
    translator: ReturnType<typeof createTranslator>,
  ): Promise<CommandRegistry> {
    const loaded = await getLoadedCommandPacks();
    return new CommandRegistry(loaded.commands, binName, translator);
  }

  /** Render help for `path`; root ([]) doubles as the onboarding / login guide. */
  function renderHelp(
    registry: CommandRegistry,
    path: string[],
    parsedFlags: Record<string, unknown>,
  ): void {
    registry.printHelp(path, process.stderr);
    if (path.length > 0) return;

    let hasKey = false;
    try {
      const auth = describeAuthState(buildSources(parsedFlags as Partial<SourceFlags>));
      hasKey = !!(auth.apiKey || auth.console);
    } catch {
      /* Credential inspection failure — fall through to welcome. */
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
    initialSources: ResolutionSources,
    configureOutput: (settings: Pick<Settings, "output" | "quiet" | "verbose">) => OutputReporter,
  ): Promise<void> {
    const res = resolve(argv, registry, localize);
    const command = res.kind === "run" || res.kind === "usageError" ? res.command : undefined;
    const outputSettings = buildOutputSettings({
      ...initialSources,
      flags: res.kind === "run" ? res.parsedFlags : initialSources.flags,
    });
    if (command?.defaultOutput !== undefined) {
      if (outputSettings.outputSource !== "flag" && outputSettings.outputSource !== "env") {
        outputSettings.output = command.defaultOutput;
      }
      outputSettings.outputExplicit = true;
    }
    // Parsing can fail after identifying a command; its output default still applies.
    const reporter = configureOutput(outputSettings);

    switch (res.kind) {
      case "introspect":
        process.stdout.write(
          serializeCommandSchema(buildCommandSchema(registry, identity, res.path)),
        );
        return;
      case "version":
        process.stdout.write(`${binName} ${version}\n`);
        return;

      case "help":
        renderHelp(registry, res.path, res.parsedFlags);
        return;

      case "usageError":
        throw res.error;

      case "run": {
        try {
          // 全局与凭证域 flag 进 sources,命令自有 flag 进 ctx.flags。
          const credDefs = credentialFlagDefs(res.command);
          const parsedFlags = res.parsedFlags;
          const globalFlags = pick(parsedFlags, [
            ...Object.keys(GLOBAL_FLAGS),
            ...Object.keys(credDefs),
          ]) as Partial<SourceFlags>;
          const ownFlags = pick(
            parsedFlags,
            Object.keys(res.command.flags ?? {}),
          ) as ParsedFlags<FlagsDef>;
          const invalid = await res.command.validate?.(ownFlags);
          if (invalid) throw new UsageError(localize(invalid));

          // 校验通过 → 建源、解析 settings、组 ctx,进中间件执行命令。
          const sources = { ...initialSources, flags: globalFlags };
          const settings = { ...buildSettings(sources), ...outputSettings };
          const ctx: RunContext = {
            commandPath: (command) => registry.commandPath(command),
            identity,
            output: reporter.output,
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
              debug: (diagnostic) => reporter.output.debug(diagnostic),
              ...resolveModelBaseUrlState(sources),
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
          throw err;
        }
        return;
      }
    }
  }

  return {
    async run(argv: string[] = process.argv.slice(2)) {
      const flags = presentationFlags(argv);
      let translator = createTranslator(DEFAULT_LANGUAGE);
      const localize = (text: LocalizedText) => translator.localize(text);
      const initialSettings = buildOutputSettings({ flags, env: process.env });
      let reporter = createOutputReporter({ settings: initialSettings, localize, binName });
      const warnings: OutputDiagnostic[] = [];
      const cleanup = installProcessHandlers(() => reporter, localize);
      try {
        const sources = buildSources(flags, (warning) => warnings.push(warning));
        translator = createTranslator(sources.file.language ?? DEFAULT_LANGUAGE);
        reporter = createOutputReporter({
          settings: buildOutputSettings(sources),
          localize,
          binName,
        });
        setupProxyFromEnv();
        const registry = await getRegistry(translator);
        await dispatch(registry, argv, localize, sources, (settings) => {
          reporter = createOutputReporter({ settings, localize, binName });
          for (const warning of warnings.splice(0)) reporter.output.warning(warning);
          return reporter;
        });
      } catch (error) {
        for (const warning of warnings.splice(0)) reporter.output.warning(warning);
        await flushTelemetry(1000);
        handleError(error, reporter);
      } finally {
        cleanup();
      }
    },
  };
}
