import type {
  AnyCommand,
  CommandPackManager,
  FlagDef,
  FlagsDef,
  Identity,
  ParsedFlags,
} from "bailian-cli-core";
import {
  BailianError,
  Client,
  ExitCode,
  UsageError,
  buildSettings,
  buildSources,
  makeAuthStore,
  makeConfigStore,
  resolveModelBaseUrl,
} from "bailian-cli-core";
import { camelToKebab } from "../args.ts";
import { compose, authStage, runCommandStage, type RunContext } from "../middleware.ts";
import { withCapturedOutput } from "./output-capture.ts";

export interface InvokeCommandOptions {
  identity: Identity;
  path: string[];
  command: AnyCommand;
  /** Tool arguments keyed by camelCase flag names. */
  args: Record<string, unknown>;
  commandPacks: CommandPackManager;
}

function coerceOwnFlags(command: AnyCommand, args: Record<string, unknown>): ParsedFlags<FlagsDef> {
  const defs: FlagsDef = command.flags ?? {};
  const ownFlags: Record<string, unknown> = {};

  for (const key of Object.keys(defs)) {
    const def: FlagDef = defs[key]!;
    if (key in args) {
      ownFlags[key] = args[key];
      continue;
    }
    if (def.type === "switch") {
      ownFlags[key] = false;
    }
  }

  for (const key of Object.keys(defs)) {
    const def: FlagDef = defs[key]!;
    if (def.type !== "switch" && "required" in def && def.required && !(key in ownFlags)) {
      throw new UsageError(`Missing required flag: --${camelToKebab(key)}`);
    }
  }

  const invalid = command.validate?.(ownFlags as ParsedFlags<FlagsDef>);
  if (invalid) throw new UsageError(invalid);

  return ownFlags as ParsedFlags<FlagsDef>;
}

function formatInvokeError(error: unknown): string {
  if (error instanceof BailianError) {
    const parts = [error.message];
    if (error.hint) parts.push(error.hint);
    return parts.join("\n");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Run one leaf command under MCP: force JSON + quiet, capture emitResult/emitBare,
 * reuse auth stage. Does not write to process.stdout.
 */
export async function invokeCommandForMcp(
  options: InvokeCommandOptions,
): Promise<{ ok: true; text: string } | { ok: false; text: string }> {
  try {
    const ownFlags = coerceOwnFlags(options.command, options.args);
    const sources = buildSources({});
    const settings = {
      ...buildSettings(sources),
      quiet: true,
      output: "json" as const,
      verbose: false,
    };

    const ctx: RunContext = {
      identity: options.identity,
      path: options.path,
      command: options.command,
      flags: ownFlags,
      settings,
      sources,
      configStore: makeConfigStore(sources.configName),
      authStore: makeAuthStore(sources),
      commandPacks: options.commandPacks,
      client: new Client({
        identity: options.identity,
        settings,
        baseUrl: resolveModelBaseUrl(sources),
      }),
    };

    const run = compose([authStage, runCommandStage]);
    const { stdout } = await withCapturedOutput(() => run(ctx));
    const text = stdout.trimEnd() || JSON.stringify({ ok: true });
    return { ok: true, text };
  } catch (error) {
    const text = formatInvokeError(error);
    if (error instanceof BailianError && error.exitCode === ExitCode.AUTH) {
      return {
        ok: false,
        text: `${text}\n\nAuthenticate in a terminal first: ${options.identity.binName} auth login`,
      };
    }
    return { ok: false, text };
  }
}
