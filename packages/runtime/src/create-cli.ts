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
import type { Command, Config, GlobalFlags } from "bailian-cli-core";
import {
  GLOBAL_OPTIONS,
  IncompleteCommandError,
  loadConfig,
  flushTelemetry,
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
  /** Telemetry client name (e.g. "bailian-cli", "rag-cli"). Defaults to `binName`. */
  clientName?: string;
  /** npm package name for self-update (e.g. "bailian-cli", "bailian-cli-rag"). */
  npmPackage: string;
}

export interface Cli {
  run(argv?: string[]): Promise<void>;
}

/**
 * Build a CLI from an injected command set. The kernel is agnostic to *which*
 * commands exist — each product (bailian-cli, rag-cli, …) passes its own map and
 * identity. `run` is a thin orchestrator: resolve argv into a {@link Resolution},
 * then dispatch — terminal kinds render and return; `run` enters the middleware
 * stack guarded by a single error boundary. No business `if`s, no scattered
 * `process.exit`.
 */
export function createCli(commands: Record<string, Command>, opts: CliOptions): Cli {
  const registry = new CommandRegistry(commands, opts.binName);
  const clientName = opts.clientName ?? opts.binName;
  const { binName, version, npmPackage } = opts;

  try {
    setupProxyFromEnv();
  } catch (err) {
    handleError(err, binName);
  }

  // 优雅处理 Ctrl+C
  process.on("SIGINT", () => {
    process.stderr.write("\nInterrupted. Exiting.\n");
    void flushTelemetry(500).finally(() => process.exit(130));
  });

  // 优雅处理 stdout EPIPE（例如管道到提前退出的 `mpv`）
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EPIPE") process.exit(0);
    else throw e;
  });

  const runMiddleware = compose([versionCheckStage, telemetryStage, authStage, runCommandStage]);

  function buildConfig(flags: GlobalFlags): Config {
    const config = loadConfig(flags);
    config.clientName = clientName;
    config.clientVersion = version;
    config.binName = binName;
    config.npmPackage = npmPackage;
    return config;
  }

  /** Render help for `path`; root ([]) doubles as the onboarding / login guide. */
  function renderHelp(path: string[], argv: string[]): void {
    registry.printHelp(path, process.stderr);
    if (path.length > 0) return;

    let hasKey = false;
    try {
      const config = buildConfig(parseFlags(argv, GLOBAL_OPTIONS));
      hasKey = !!(
        config.apiKey ||
        config.fileApiKey ||
        config.fileAccessToken ||
        config.accessTokenEnv
      );
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
          const flags = parseFlags(res.rest, [...GLOBAL_OPTIONS, ...(res.command.options ?? [])]);
          const invalid = res.command.validate?.(flags);
          if (invalid) throw new IncompleteCommandError(invalid);
          const config = buildConfig(flags);
          const ctx: RunContext = {
            binName,
            version,
            npmPackage,
            path: res.path,
            command: res.command,
            config,
            flags,
          };
          await runMiddleware(ctx);
          await flushTelemetry(1000);
        } catch (err) {
          await flushTelemetry(1000);
          if (err instanceof IncompleteCommandError) {
            registry.printHelp(res.path, process.stderr);
            return;
          }
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
