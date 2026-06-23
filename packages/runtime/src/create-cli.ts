import { scanCommandPath, parseFlags } from "./args.ts";
import { CommandRegistry } from "./registry.ts";
import type { Command } from "bailian-cli-core";
import {
  GLOBAL_OPTIONS,
  loadConfig,
  resolveCredential,
  trackCommandExecution,
  flushTelemetry,
} from "bailian-cli-core";
import { ensureApiKey } from "./utils/ensure-key.ts";
import { setupProxyFromEnv } from "./proxy.ts";
import { handleError } from "./error-handler.ts";
import { checkForUpdate, getPendingUpdateNotification } from "./utils/update-checker.ts";
import { maybeShowStatusBar } from "./output/status-bar.ts";
import { printWelcomeBanner, printQuickStart } from "./output/banner.ts";
import { registerCommandHelpPrinter, setExecutingCommandPath } from "./utils/command-help.ts";

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
 * Build a CLI from an injected command set. The runtime is agnostic to *which*
 * commands exist — each product (bailian-cli, rag-cli, …) passes its own map and
 * identity. No module-level singleton: the registry is scoped to this instance.
 */
export function createCli(commands: Record<string, Command>, opts: CliOptions): Cli {
  const registry = new CommandRegistry(commands, opts.binName);
  const clientName = opts.clientName ?? opts.binName;
  const npmPackage = opts.npmPackage;
  const version = opts.version;

  // 必须在任何 fetch 发起前安装（含 update-checker / telemetry）
  try {
    setupProxyFromEnv();
  } catch (err) {
    handleError(err, opts.binName);
  }

  registerCommandHelpPrinter((commandPath, out) => {
    registry.printHelp(commandPath, out);
  });

  // 优雅处理 Ctrl+C
  // 退出前尝试 best-effort 刷出埋点，让去抖队列中 / 在途的 fetch 请求有机会
  // 落网络；flush 与较短超时 race，保证 SIGINT 仍然响应及时。
  process.on("SIGINT", () => {
    process.stderr.write("\nInterrupted. Exiting.\n");
    void flushTelemetry(500).finally(() => process.exit(130));
  });

  // 优雅处理 stdout EPIPE（例如管道到提前退出的 `mpv`）
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EPIPE") process.exit(0);
    else throw e;
  });

  async function main(): Promise<void> {
    let argv = process.argv.slice(2);
    if (argv[0] === "--") argv = argv.slice(1);

    if (argv.includes("--version") || argv.includes("-v")) {
      process.stdout.write(`${opts.binName} ${version}\n`);
      process.exit(0);
    }

    const commandPath = scanCommandPath(argv, GLOBAL_OPTIONS);

    if (argv.includes("--help") || argv.includes("-h")) {
      registry.printHelp(commandPath, process.stderr);
      process.exit(0);
    }

    // 未传任何命令：展示帮助信息与登录引导
    if (commandPath.length === 0) {
      registry.printHelp([], process.stderr);

      const flags = parseFlags(argv, GLOBAL_OPTIONS);
      const config = loadConfig(flags);
      config.clientName = clientName;
      config.clientVersion = version;
      config.binName = opts.binName;
      config.npmPackage = npmPackage;

      const hasKey = !!(
        config.apiKey ||
        config.fileApiKey ||
        config.fileAccessToken ||
        config.accessTokenEnv
      );
      if (hasKey) printQuickStart();
      else printWelcomeBanner(opts.binName);
      process.exit(0);
    }

    // 组路径（例如 `bl speech` 未接子命令）：展示帮助后干净退出
    if (registry.isGroupPath(commandPath)) {
      registry.printHelp(commandPath, process.stderr);
      process.exit(0);
    }

    const { command, extra } = registry.resolve(commandPath);
    const flags = parseFlags(argv, [...GLOBAL_OPTIONS, ...(command.options ?? [])]);

    if (extra.length > 0) (flags as Record<string, unknown>)._positional = extra;

    const config = loadConfig(flags);
    config.clientName = clientName;
    config.clientVersion = version;
    config.binName = opts.binName;
    config.npmPackage = npmPackage;

    // 默认执行 ensureApiKey；自行处理鉴权或仅需 Console/AK-SK 等的命令在 defineCommand 上设 skipDefaultApiKeySetup
    if (!command.skipDefaultApiKeySetup) {
      await ensureApiKey(config);
      try {
        const credential = await resolveCredential(config);
        maybeShowStatusBar(config, credential.token, credential);
      } catch {
        /* 没有凭证，不展示状态栏 */
      }
    }

    const updateCheckPromise = checkForUpdate(version, npmPackage).catch(() => {});

    setExecutingCommandPath(commandPath);

    await trackCommandExecution(config, commandPath, flags, () => command.execute(config, flags));

    await updateCheckPromise;
    const isUpdateCommand = commandPath.length === 1 && commandPath[0] === "update";
    const newVersion = getPendingUpdateNotification();
    if (newVersion && !config.quiet && !isUpdateCommand) {
      const isTTY = process.stderr.isTTY;
      const yellow = isTTY ? "\x1b[33m" : "";
      const cyan = isTTY ? "\x1b[36m" : "";
      const reset = isTTY ? "\x1b[0m" : "";
      process.stderr.write(`\n  ${yellow}Update available: ${version} → ${newVersion}${reset}\n`);
      process.stderr.write(`  Run ${cyan}${opts.binName} update${reset} to upgrade\n\n`);
    }

    // 进程退出前尽力等待在途的埋点完成。
    // 使用较短超时兜底，避免慢网拖慢用户感知。
    await flushTelemetry(1000);
  }

  return {
    run() {
      return main().catch((err) => {
        // 在 handleError() 调用 process.exit() 之前刷出在途埋点。
        // 命令抛出的错误已被 trackCommandExecution 的 finally 块记录，
        // 但底层 tracker 有 ~500ms 的发送去抖。不主动 flush 的话，
        // 错误事件会随进程退出丢掉。
        return flushTelemetry(1000).finally(() =>
          handleError(err, opts.binName),
        ) as unknown as void;
      });
    },
  };
}
