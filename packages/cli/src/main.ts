import { scanCommandPath, parseFlags } from "./args.ts";
import { registry } from "./registry.ts";
import {
  GLOBAL_OPTIONS,
  loadConfig,
  resolveCredential,
  trackCommandExecution,
  flushTelemetry,
} from "bailian-cli-core";
import { ensureApiKey } from "./utils/ensure-key.ts";
import { handleError } from "./error-handler.ts";
import { checkForUpdate, getPendingUpdateNotification } from "./utils/update-checker.ts";
import { maybeShowStatusBar } from "./output/status-bar.ts";
import { printWelcomeBanner, printQuickStart } from "./output/banner.ts";
import { CLI_VERSION } from "./version.ts";
import {
  printCurrentCommandHelp,
  registerCommandHelpPrinter,
  setExecutingCommandPath,
} from "./utils/command-help.ts";

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

// 自己接管鉴权 或 根本不需要 API key 的命令
const NO_AUTH_SETUP = [
  ["auth", "login"],
  ["auth", "logout"],
  ["config", "show"],
  ["config", "set"],
  ["config", "export-schema"],
  ["update"],
  ["knowledge", "retrieve"],
  ["pipeline", "run"],
  ["pipeline", "validate"],
  ["model", "list"],
  ["app", "list"],
  ["console", "call"],
  ["usage", "free"],
  ["usage", "freetier"],
  ["usage", "stats"],
  ["mcp", "list"],
  ["mcp", "tools"],
  ["mcp", "call"],
  ["workspace", "list"],
  ["quota", "list"],
  ["quota", "request"],
  ["quota", "history"],
  ["quota", "check"],
];

async function main() {
  let argv = process.argv.slice(2);
  if (argv[0] === "--") argv = argv.slice(1);

  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`bl ${CLI_VERSION}\n`);
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
    config.clientName = "bailian-cli";
    config.clientVersion = CLI_VERSION;

    const hasKey = !!(
      config.apiKey ||
      config.fileApiKey ||
      config.fileAccessToken ||
      config.accessTokenEnv
    );
    if (hasKey) printQuickStart();
    else printWelcomeBanner();
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
  config.clientName = "bailian-cli";
  config.clientVersion = CLI_VERSION;

  const needsAuthSetup = !NO_AUTH_SETUP.some((cmd) => cmd.every((c, i) => commandPath[i] === c));
  if (needsAuthSetup) {
    await ensureApiKey(config);
    try {
      const credential = await resolveCredential(config);
      maybeShowStatusBar(config, credential.token, credential);
    } catch {
      /* 没有凭证，不展示状态栏 */
    }
  }

  const updateCheckPromise = checkForUpdate(CLI_VERSION).catch(() => {});

  setExecutingCommandPath(commandPath);

  if (
    commandPath[0] === "auth" &&
    commandPath[1] === "login" &&
    !flags.console &&
    !String((flags.apiKey as string | undefined) ?? "").trim() &&
    !String(config.apiKey ?? "").trim() &&
    !process.env.DASHSCOPE_API_KEY?.trim()
  ) {
    printCurrentCommandHelp(process.stderr);
    process.exit(0);
  }

  await trackCommandExecution(config, commandPath, flags, () => command.execute(config, flags));

  await updateCheckPromise;
  const isUpdateCommand = commandPath.length === 1 && commandPath[0] === "update";
  const newVersion = getPendingUpdateNotification();
  if (newVersion && !config.quiet && !isUpdateCommand) {
    const isTTY = process.stderr.isTTY;
    const yellow = isTTY ? "\x1b[33m" : "";
    const cyan = isTTY ? "\x1b[36m" : "";
    const reset = isTTY ? "\x1b[0m" : "";
    process.stderr.write(`\n  ${yellow}Update available: ${CLI_VERSION} → ${newVersion}${reset}\n`);
    process.stderr.write(`  Run ${cyan}bl update${reset} to upgrade\n\n`);
  }

  // 进程退出前尽力等待在途的埋点完成。
  // 使用较短超时兜底，避免慢网拖慢用户感知。
  await flushTelemetry(1000);
}

main().catch((err) => {
  // 在 handleError() 调用 process.exit() 之前刷出在途埋点。
  // 命令抛出的错误已被 trackCommandExecution 的 finally 块记录，
  // 但底层 tracker 有 ~500ms 的发送去抖。不主动 flush 的话，
  // 错误事件会随进程退出丢掉。
  void flushTelemetry(1000).finally(() => handleError(err));
});
