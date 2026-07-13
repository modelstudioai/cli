// Runtime framework for bailian-cli products. Agnostic to which commands exist:
// each entrypoint (bl / rag / …) injects its own command set via createCli().

// Entrypoint factory + identity
export { createCli } from "./create-cli.ts";
export type { Cli, CliOptions } from "./create-cli.ts";

// Command Pack product policy
export type {
  CommandPackCredentialAccess,
  CommandPackDefinition,
  CommandPackPolicy,
} from "./command-packs/types.ts";

// Command routing
export { CommandRegistry } from "./registry.ts";
export type { Command, FlagDef, LocateResult } from "./registry.ts";
export { resolve } from "./resolve.ts";
export type { Resolution } from "./resolve.ts";
export { compose, type RunContext, type Middleware } from "./middleware.ts";

// Arg parsing
export { parsePath, parseFlags } from "./args.ts";
export type { ParsePathResult } from "./args.ts";

// Process-level setup / error handling
export { setupProxyFromEnv } from "./proxy.ts";
export { handleError } from "./error-handler.ts";
export { CLI_VERSION } from "./version.ts";

// Console URLs referenced by commands (e.g. auth/status, banner)
export { BAILIAN_CONSOLE_ROOT, BAILIAN_CONSOLE, API_KEY_PAGE, VOICE_TTS_PAGE } from "./urls.ts";

// Output facilities consumed by commands
export { emitResult, emitBare } from "./output/output.ts";
export { formatTable } from "./output/table.ts";
export { renderBoxTable, type BoxTableOptions, type BarColumn } from "./output/box-table.ts";
export { createSpinner, createProgressBar } from "./output/progress.ts";
export { printWelcomeBanner, printQuickStart } from "./output/banner.ts";
export { maybeShowStatusBar } from "./output/status-bar.ts";
export { displayWidth, padEnd } from "./output/cjk-width.ts";
export {
  ansi,
  isTerminal,
  supportsColor,
  type AnsiStyles,
  type TextStyle,
} from "./output/color.ts";

// Utility facilities consumed by commands
export { poll } from "./utils/polling.ts";
export { downloadFile, formatBytes } from "./utils/download.ts";
export { runConcurrent, getConcurrency, downloadParallel } from "./utils/concurrent.ts";
export { resolveImageSize } from "./utils/image-size.ts";
export {
  checkForUpdate,
  getPendingUpdateNotification,
  fetchLatestVersion,
  NPM_PACKAGE,
  NPM_REGISTRY,
} from "./utils/update-checker.ts";
export {
  BOOL_FLAG_WATERMARK,
  BOOL_FLAG_PROMPT_EXTEND_CLI_TRUE,
  BOOL_FLAG_PROMPT_EXTEND_IMAGE_GENERATE,
  BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT,
} from "./utils/flag-descriptions.ts";

// Pipeline subsystem consumed by pipeline commands
export { initPipelineSteps } from "./pipeline/init.ts";
export { executePipeline, streamPipelineEvents } from "./pipeline/executor.ts";
export { collectPipelineIssues, collectPipelineHints } from "./pipeline/validation.ts";
export type { PipelineDefinition, PipelineLifecycleEvent } from "./pipeline/types.ts";
