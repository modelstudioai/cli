import { CommandRegistry } from "./registry.ts";
import { resolve, type Resolution } from "./resolve.ts";
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
  PreControlPlane,
} from "bailian-cli-core";
import {
  formatCommand,
  DEFAULT_LANGUAGE,
  BailianError,
  ExitCode,
  GLOBAL_FLAGS,
  UsageError,
  credentialFlagDefs,
  buildSources,
  buildSettings,
  buildOutputSettings,
  resolveRecoveryConfigName,
  describeAuthState,
  resolveModelBaseUrlState,
  makeConfigStore,
  makeAuthStore,
  flushTelemetry,
  reportFirstInstallNow,
  isFirstInstallReportLaunch,
  Client,
  createRequestSignals,
} from "bailian-cli-core";
import { setupProxyFromEnv } from "./proxy.ts";
import { handleError } from "./error-handler.ts";
import { flushOutput, INTERRUPT_FLUSH_TIMEOUT_MS, trackStreamWrites } from "./output/flush.ts";
import { type OutputReporter, createOutputReporter } from "./output/reporter.ts";
import { loadCommandPacks } from "./command-packs/load.ts";
import { createCommandPackManager } from "./command-packs/manager.ts";
import type { CommandPackPolicy } from "./command-packs/types.ts";
import { createTranslator } from "./i18n.ts";

/** Per-product identity injected by each CLI entrypoint (bl / rag / …). */
export interface CliOptions {
  /** Product binary name and default invocation (e.g. "bl", "rag"). */
  binName: string;
  /** Explicit executable invocation for structured command references. */
  commandInvocation?: Identity["commandInvocation"];
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
  /** Resolve pre-release routing once per invocation; omitted by hosts without a control-plane switch. */
  preControlPlane?: () => PreControlPlane | undefined;
  validatePreControlPlaneCommand?: (path: string) => void;
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
    if (argument === "--quiet") {
      flags.quiet = true;
      continue;
    }
    if (argument === "--verbose") {
      flags.verbose = true;
      continue;
    }

    for (const key of ["output", "config"] as const) {
      let value: string | undefined;
      if (argument.startsWith(`--${key}=`)) value = argument.slice(key.length + 3);
      else if (argument === `--${key}`) {
        const next = argv[index + 1];
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          index++;
        }
      } else continue;

      if (value === undefined) continue;
      if (key === "config") {
        flags.config = value;
        continue;
      }
      // Only accept legal formats here; illegal values are rejected by parseFlags.
      if (value === "text" || value === "json") flags.output = value;
    }
  }
  return flags;
}

function isPresentationOnly(resolution?: Resolution): boolean {
  return (
    resolution?.kind === "help" ||
    resolution?.kind === "version" ||
    resolution?.kind === "introspect"
  );
}

function usesModelConfig(resolution: Resolution, registry: CommandRegistry): boolean {
  if (resolution.kind === "usageError") return resolution.command?.auth === "apiKey";
  if (resolution.kind !== "run" && resolution.kind !== "help") return false;
  const target = resolution.kind === "run" ? resolution : registry.locate(resolution.path);
  if (target.kind !== "run" && target.kind !== "leaf") return false;
  const { apiKey, console, openApi } = resolution.parsedFlags;
  return (
    target.command.auth === "apiKey" ||
    // Login itself is auth-free, so only the model login mode uses the model file.
    (resolution.path.join(" ") === "auth login" &&
      typeof apiKey === "string" &&
      Boolean(apiKey.trim()) &&
      !console &&
      !openApi)
  );
}

interface ProcessOutputContext {
  getReporter: () => OutputReporter;
  localize: (text: LocalizedText) => string;
  getOutputFormat: () => "text" | "json";
}

const activeProcessOutputs = new Set<ProcessOutputContext>();
const managedInterruptHandlers = new Set<() => void>();
/** True while the default SIGINT path is flushing before exit(130). */
let interruptExiting = false;

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
  // Second Ctrl-C during flush: exit immediately instead of waiting out the short timeout.
  if (interruptExiting) {
    process.exit(130);
    return;
  }
  const active = activeProcessOutputs.values().next().value;
  if (!active) return;
  interruptExiting = true;
  active
    .getReporter()
    .error(
      new BailianError(
        active.localize({ "en-US": "Interrupted. Exiting.", "zh-CN": "操作已中断，正在退出。" }),
        130 as ExitCode,
      ),
    );
  void flushTelemetry(500)
    .catch(() => undefined)
    .then(() =>
      flushOutput(INTERRUPT_FLUSH_TIMEOUT_MS, {
        mode: "deadline",
        format: active.getOutputFormat(),
      }),
    )
    .finally(() => process.exit(130));
}

/** Keep EPIPE protection after run() returns, without retaining completed invocations. */
function handleStdoutPipeError(error: NodeJS.ErrnoException): void {
  // Broken pipe: further flush cannot deliver data and may wait out the timeout.
  if (error.code === "EPIPE") process.exit(0);
  const active = activeProcessOutputs.values().next().value;
  if (active) {
    const code = active.getReporter().error(error);
    void flushOutput(INTERRUPT_FLUSH_TIMEOUT_MS, {
      mode: "deadline",
      format: active.getOutputFormat(),
    }).finally(() => process.exit(code));
    return;
  }
  // Outside an invocation, let other listeners handle errors or retain Node's failure behavior.
  if (process.stdout.listenerCount("error") === 1) throw error;
}

function installProcessHandlers(
  getReporter: () => OutputReporter,
  localize: (text: LocalizedText) => string,
  getOutputFormat: () => "text" | "json",
): () => void {
  if (!process.stdout.listeners("error").includes(handleStdoutPipeError)) {
    process.stdout.on("error", handleStdoutPipeError);
  }
  if (activeProcessOutputs.size === 0) {
    interruptExiting = false;
    process.on("SIGINT", handleInterrupt);
  }
  const context = { getReporter, localize, getOutputFormat };
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
  const identity: Identity = {
    binName,
    version,
    npmPackage,
    clientName,
    ...(opts.commandInvocation ? { commandInvocation: opts.commandInvocation } : {}),
  };
  const commandPrefix = formatCommand(identity);
  // Static product command map only (Command Packs are not included).
  const hasCommand = (path: string) => path in commands;
  const commandPackPolicy = opts.commandPacks ?? { supported: {} };
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
    return new CommandRegistry(loaded.commands, commandPrefix, translator);
  }

  /** Render help for `path`; root ([]) doubles as the onboarding / login guide. */
  function renderHelp(registry: CommandRegistry, path: string[], sources: ResolutionSources): void {
    registry.printHelp(path, process.stderr);
    if (path.length > 0) return;

    let hasKey = false;
    try {
      const auth = describeAuthState(sources);
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
    res: Resolution,
    localize: (text: LocalizedText) => string,
    initialSources: ResolutionSources,
    configureOutput: (settings: Pick<Settings, "output" | "quiet" | "verbose">) => OutputReporter,
    preControlPlane?: PreControlPlane,
  ): Promise<void> {
    const command = res.kind === "run" || res.kind === "usageError" ? res.command : undefined;
    const outputSettings = buildOutputSettings({
      ...initialSources,
      flags: res.kind === "run" ? res.parsedFlags : initialSources.flags,
    });
    if (command?.defaultOutput !== undefined) {
      if (
        outputSettings.outputSource === "default" ||
        (outputSettings.outputSource === "file" && command.defaultOutputOverridesProfile)
      ) {
        outputSettings.output =
          outputSettings.outputSource === "default" && process.stdout.isTTY
            ? (command.defaultInteractiveOutput ?? command.defaultOutput)
            : command.defaultOutput;
      }
      outputSettings.outputExplicit = true;
    }
    if (
      res.kind === "run" &&
      command?.verboseFlags?.some((flag) => Boolean(res.parsedFlags[flag]))
    ) {
      outputSettings.verbose = true;
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
        process.stdout.write(`${commandPrefix} ${version}\n`);
        return;

      case "help":
        renderHelp(registry, res.path, {
          ...initialSources,
          flags: res.parsedFlags as Partial<SourceFlags>,
        });
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
          if (typeof globalFlags.workspaceId === "string" && !globalFlags.workspaceId.trim()) {
            throw new UsageError(
              localize({
                "en-US": "--workspace-id must not be empty or whitespace.",
                "zh-CN": "--workspace-id 不能为空或仅包含空白字符。",
              }),
            );
          }
          const ownFlags = pick(
            parsedFlags,
            Object.keys(res.command.flags ?? {}),
          ) as ParsedFlags<FlagsDef>;
          const invalid = await res.command.validate?.(ownFlags);
          if (invalid) throw new UsageError(localize(invalid));

          // 校验通过 → 建源、解析 settings、组 ctx,进中间件执行命令。
          const sources = { ...initialSources, flags: globalFlags };
          const settings = { ...buildSettings(sources), ...outputSettings };
          let controlSources: ResolutionSources | undefined;
          if (preControlPlane && !sources.preControlPlane) {
            // Keep model options (including workspace and output), but never use
            // a production Profile's Console scope on the pre-release gateway.
            settings.preControlPlane = preControlPlane;
            settings.consoleRegion = globalFlags.consoleRegion || undefined;
            settings.consoleSite =
              (globalFlags.consoleSite as Settings["consoleSite"]) || undefined;
            settings.consoleSwitchAgent = globalFlags.consoleSwitchAgent || undefined;
            if (res.command.optionalConsole) {
              try {
                const selected = buildSources(
                  globalFlags,
                  (warning) => reporter.output.warning(warning),
                  preControlPlane,
                );
                const { consoleRegion, consoleSite, consoleSwitchAgent } = buildSettings(selected);
                Object.assign(settings, { consoleRegion, consoleSite, consoleSwitchAgent });
                controlSources = selected;
              } catch {
                reporter.output.warning({
                  code: "PRE_CONSOLE_CONFIG_UNAVAILABLE",
                  message: {
                    "en-US":
                      "Pre-release Console configuration is unavailable; continuing without its credentials.",
                    "zh-CN": "预发控制台配置不可用；将不使用控制台凭据继续执行。",
                  },
                });
              }
            }
          }
          const ctx: RunContext = {
            hasCommand,
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
            controlSources,
            configStore: makeConfigStore(sources.configName, sources.configPath),
            authStore: makeAuthStore(sources, {
              identity,
              timeout: settings.timeout,
              debug: (diagnostic) => reporter.output.debug(diagnostic),
              warning: (diagnostic) => reporter.output.warning(diagnostic),
            }),
            commandPacks: createCommandPackManager(identity, commandPackPolicy, reporter.output),
            setRecoveryConfigName: (name) => reporter.setRecoveryConfigName(name),
            client: new Client({
              identity,
              settings,
              debug: (diagnostic) => reporter.output.debug(diagnostic),
              ...resolveModelBaseUrlState(sources),
              // `auth: "none"` commands keep this Client, so it needs its own
              // per-run record; the other auth domains get a fresh one from
              // authStage.
              requestSignals: createRequestSignals(),
            }),
          };
          await runMiddleware(ctx);
          await flushTelemetry(1000);
        } catch (err) {
          // 裸调用（命令后什么都没写）下的 UsageError → 当"还没写完"，打 help、exit 0；
          // 写了 flag 却无效、或执行时报错 → 报错、exit 2。
          if (err instanceof UsageError && res.rest.length === 0 && !preControlPlane) {
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
      // Installers launch `bl --bailian-first-install-report` with the env var
      // after a new user's install.json is written. Either one alone is a normal run.
      if (isFirstInstallReportLaunch(argv)) {
        try {
          setupProxyFromEnv();
        } catch {
          // An invalid proxy must not fail installation. The report then uses a direct connection.
        }
        await reportFirstInstallNow(identity);
        return;
      }
      const flags = presentationFlags(argv);
      let translator = createTranslator(DEFAULT_LANGUAGE);
      const localize = (text: LocalizedText) => translator.localize(text);
      const initialSettings = buildOutputSettings({ flags, env: process.env });
      let outputFormat: "text" | "json" = initialSettings.output;
      let reporter = createOutputReporter({
        settings: initialSettings,
        localize,
        commandPrefix,
        hasCommand,
      });
      const warnings: OutputDiagnostic[] = [];
      const cleanup = installProcessHandlers(
        () => reporter,
        localize,
        () => outputFormat,
      );
      try {
        let preControlPlane: PreControlPlane | undefined;
        let controlPlaneError: UsageError | undefined;
        try {
          preControlPlane = opts.preControlPlane?.();
        } catch (error) {
          if (!(error instanceof UsageError)) throw error;
          controlPlaneError = error;
        }

        let registry: CommandRegistry | undefined;
        let resolution: Resolution | undefined;
        let sourcePlane = preControlPlane;
        if (preControlPlane || controlPlaneError) {
          // Only the pre-release switch needs to identify the command before
          // loading preferences. The registry localizes lazily after selection.
          registry = await getRegistry({
            get language() {
              return translator.language;
            },
            localize,
          });
          resolution = resolve(argv, registry, localize);
          if (controlPlaneError && !isPresentationOnly(resolution)) throw controlPlaneError;
          if (preControlPlane && resolution.kind === "run") {
            opts.validatePreControlPlaneCommand?.(
              (registry.commandPath(resolution.command) ?? resolution.path).join(" "),
            );
          }
          if (usesModelConfig(resolution, registry)) sourcePlane = undefined;
        }

        let sources: ResolutionSources = { flags, env: process.env, file: {} };
        if (!controlPlaneError) {
          try {
            sources = buildSources(flags, (warning) => warnings.push(warning), sourcePlane);
          } catch (error) {
            // Help/version must remain usable to recover from bad pre-release
            // configuration. Never read another environment as a fallback.
            if (!preControlPlane || !isPresentationOnly(resolution)) throw error;
          }
        }
        const recoveryConfigName = resolveRecoveryConfigName(sources);
        translator = createTranslator(sources.file.language ?? DEFAULT_LANGUAGE);
        const sourceSettings = buildOutputSettings(sources);
        outputFormat = sourceSettings.output;
        reporter = createOutputReporter({
          settings: sourceSettings,
          localize,
          commandPrefix,
          hasCommand,
          configName: recoveryConfigName,
        });
        setupProxyFromEnv();
        registry ??= await getRegistry(translator);
        // On parser failures, render the diagnostic in the selected language.
        if (!resolution || resolution.kind === "usageError") {
          resolution = resolve(argv, registry, localize);
        }
        await dispatch(
          registry,
          resolution,
          localize,
          sources,
          (settings) => {
            outputFormat = settings.output;
            reporter = createOutputReporter({
              settings,
              localize,
              commandPrefix,
              hasCommand,
              configName: recoveryConfigName,
            });
            for (const warning of warnings.splice(0)) reporter.output.warning(warning);
            return reporter;
          },
          preControlPlane,
        );
      } catch (error) {
        for (const warning of warnings.splice(0)) reporter.output.warning(warning);
        await flushTelemetry(1000);
        await handleError(error, reporter);
      } finally {
        cleanup();
      }
    },
  };
}

/**
 * Product entry helper: await the invocation, flush tracked stdout/stderr, then
 * exit. Forces the process to leave after a successful run so Bun keep-alive
 * sockets cannot linger (~50 s on Windows release binaries).
 *
 * `run()` itself stays unchanged for in-process harnesses. Install write
 * tracking before `run()` so every real write's callback is awaited; an empty
 * `write("")` flush is not reliable on Bun when stdout is a pipe.
 *
 * Success-path flush waits until writes complete (no hard timeout) so slow
 * readers such as `| less` are not truncated.
 */
export async function runToExit(cli: Cli, argv?: string[]): Promise<void> {
  trackStreamWrites(process.stdout);
  trackStreamWrites(process.stderr);
  await cli.run(argv);
  await flushOutput(null);
  process.exit(process.exitCode ?? 0);
}
