import { parseFlags } from "./args.ts";
import { CommandRegistry } from "./registry.ts";
import { resolve } from "./resolve.ts";
import {
  compose,
  authStage,
  telemetryStage,
  versionCheckStage,
  runCommandStage,
  type RunContext,
} from "./middleware.ts";
import type { AnyCommand, FlagsDef, Identity, ParsedFlags, SourceFlags } from "bailian-cli-core";
import {
  CONSOLE_AUTH_FLAGS,
  GLOBAL_FLAGS,
  MODEL_AUTH_FLAGS,
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
import { printWelcomeBanner, printQuickStart } from "./output/banner.ts";

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
  const registry = new CommandRegistry(commands, opts.binName);
  const { binName, version, npmPackage, clientName } = opts;
  const identity: Identity = { binName, version, npmPackage, clientName };

  installProcessHandlers(binName);

  const runMiddleware = compose([versionCheckStage, telemetryStage, authStage, runCommandStage]);

  /** Render help for `path`; root ([]) doubles as the onboarding / login guide. */
  function renderHelp(path: string[], argv: string[]): void {
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
          }) as Partial<SourceFlags>,
        ),
      );
      hasKey = !!(auth.apiKey || auth.console);
    } catch {
      /* unparseable global flags on the bare invocation — fall through to welcome */
    }
    if (hasKey) printQuickStart();
    else printWelcomeBanner(binName);
  }

  async function dispatch(argv: string[]): Promise<void> {
    const res = resolve(argv, registry);

    switch (res.kind) {
      case "version":
        process.stdout.write(`${binName} ${version}\n`);
        return;

      case "help":
        renderHelp(res.path, argv);
        return;

      case "usageError":
        handleError(res.error, binName);
        return;

      case "run": {
        try {
          // 全局与凭证域 flag 进 sources,命令自有 flag 进 ctx.flags。
          const credDefs = credentialFlagDefs(res.command);
          const parsedFlags = parseFlags(res.rest, {
            ...GLOBAL_FLAGS,
            ...credDefs,
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
            settings,
            sources,
            configStore: () => makeConfigStore(),
            authStore: () => makeAuthStore(sources),
            client: new Client({ identity, settings, baseUrl: resolveModelBaseUrl(sources) }),
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
      return dispatch(argv).catch(
        (err) => flushTelemetry(1000).finally(() => handleError(err, binName)) as unknown as void,
      );
    },
  };
}
