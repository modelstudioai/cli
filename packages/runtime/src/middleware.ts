import type { AnyCommand, Config, GlobalFlags, ApiKeyCredential } from "bailian-cli-core";
import {
  Client,
  resolveApiKeyCredential,
  resolveConsoleCredential,
  trackCommandExecution,
} from "bailian-cli-core";
import { maybeShowStatusBar } from "./output/status-bar.ts";
import { checkForUpdate, getPendingUpdateNotification } from "./utils/update-checker.ts";

/**
 * What each middleware stage gets for the invocation in flight: the matched
 * `command` with its `path`/`config`/`flags`, and the `client` (populated by
 * {@link authStage}). A stage reads these and may augment them before `next()`.
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
  /** Network surface with the credential baked in — set by {@link authStage}. */
  client: Client;
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
 * Bake the credential for the command's declared `auth` into `ctx.client`, and
 * gate: no credential → throw before the command runs (skipped under --dry-run,
 * which needs none). `auth: "none"` commands keep a credential-less client.
 */
export const authStage: Middleware = async (ctx, next) => {
  const { command, config } = ctx;
  if (command.auth === "apiKey") {
    let cred: ApiKeyCredential | undefined;
    try {
      cred = await resolveApiKeyCredential(config);
    } catch (err) {
      if (!config.dryRun) throw err; // dry-run only prints the request — no key needed
    }
    ctx.client = new Client(config, cred);
    if (cred) maybeShowStatusBar(config, cred.token, cred);
  } else if (command.auth === "console" && !config.dryRun) {
    const cred = await resolveConsoleCredential(config);
    ctx.client = new Client(config, undefined, cred);
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

/** Innermost stage: hand control to the command with its full context. */
export const runCommandStage: Middleware = (ctx) => ctx.command.run(ctx);
