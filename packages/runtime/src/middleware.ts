import type { AnyCommand, Config, GlobalFlags } from "bailian-cli-core";
import { resolveCredential, trackCommandExecution } from "bailian-cli-core";
import { ensureApiKey } from "./utils/ensure-key.ts";
import { maybeShowStatusBar } from "./output/status-bar.ts";
import { checkForUpdate, getPendingUpdateNotification } from "./utils/update-checker.ts";

/**
 * Everything a stage needs about the invocation in flight. Built once per `run`
 * by the kernel and threaded through the middleware stack. The command itself
 * still receives `(config, flags)` — this context is the pipeline's, not the
 * command's — so adding cross-cutting concerns never touches command code.
 */
export interface RunContext {
  readonly binName: string;
  readonly version: string;
  readonly npmPackage: string;
  /** The matched command path, e.g. ["speech","recognize"]. */
  readonly path: string[];
  readonly command: AnyCommand;
  config: Config;
  flags: GlobalFlags;
}

/** Koa-style onion middleware: do work, call `next()`, do work after it returns. */
export type Middleware = (ctx: RunContext, next: () => Promise<void>) => Promise<void>;

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
 * Prepare credentials for commands that need an API key. console / none
 * commands resolve their own (or no) credential inside the command body.
 */
export const authStage: Middleware = async (ctx, next) => {
  if (ctx.command.auth === "apiKey" && !ctx.config.dryRun) {
    await ensureApiKey(ctx.config);
    try {
      const credential = await resolveCredential(ctx.config);
      maybeShowStatusBar(ctx.config, credential.token, credential);
    } catch {
      /* no credential resolved — skip the status bar */
    }
  }
  await next();
};

/** Record command execution (start / success / failure) around the command. */
export const telemetryStage: Middleware = (ctx, next) =>
  trackCommandExecution(ctx.config, ctx.path, ctx.flags, next);

/**
 * Kick off a debounced update check before the command, then — only on success
 * — surface any pending notification. Never affects the command's exit code:
 * if `next()` throws, the notice is skipped (no update nag on failure).
 */
export const versionCheckStage: Middleware = async (ctx, next) => {
  const pending = checkForUpdate(ctx.version, ctx.npmPackage).catch(() => {});
  await next();
  await pending;

  const isUpdateCommand = ctx.path.length === 1 && ctx.path[0] === "update";
  const newVersion = getPendingUpdateNotification();
  if (newVersion && !ctx.config.quiet && !isUpdateCommand) {
    const isTTY = process.stderr.isTTY;
    const yellow = isTTY ? "\x1b[33m" : "";
    const cyan = isTTY ? "\x1b[36m" : "";
    const reset = isTTY ? "\x1b[0m" : "";
    process.stderr.write(`\n  ${yellow}Update available: ${ctx.version} → ${newVersion}${reset}\n`);
    process.stderr.write(`  Run ${cyan}${ctx.binName} update${reset} to upgrade\n\n`);
  }
};

/** Innermost stage: hand control to the command. */
export const runCommandStage: Middleware = (ctx) => ctx.command.run(ctx.config, ctx.flags);
