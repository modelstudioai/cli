import type { AnyCommand, FlagsDef } from "bailian-cli-core";
import {
  DEFAULT_LANGUAGE,
  GLOBAL_FLAGS,
  UsageError,
  credentialFlagDefs,
  validateTimeout,
} from "bailian-cli-core";
import type { CommandRegistry } from "./registry.ts";
import { parseFlags, parsePath } from "./args.ts";
import { confirmationFlagDefs } from "./confirm.ts";
import { createTranslator, type Translator } from "./i18n.ts";

/**
 * What an invocation resolves to — "what to do" expressed as data, not control
 * flow. A single pure function (`resolve`) produces one of these; `createCli`'s
 * dispatch switches on it. No scattered `argv.includes(...)` + `process.exit`.
 *  - version: print the version and stop.
 *  - help:    print help for `path` (root [] / a group / an explicit --help). Terminal.
 *  - run:     execute `command` with the already parsed and validated flags.
 *  - usageError: the path doesn't exist (or has unexpected args); render and stop.
 */
export type Resolution =
  | { kind: "version" }
  | { kind: "introspect"; path: string[] }
  | { kind: "help"; path: string[]; parsedFlags: Record<string, unknown> }
  | {
      kind: "run";
      path: string[];
      command: AnyCommand;
      rest: string[];
      parsedFlags: Record<string, unknown>;
    }
  | { kind: "usageError"; error: UsageError };

/**
 * Classify argv into a {@link Resolution}. Pure over (argv, registry).
 * Match the command, then parse and validate all flags once. Help/version skip
 * required enforcement. Dispatch reuses the parsed flags instead of parsing again.
 */
export function resolve(
  argv: string[],
  registry: CommandRegistry,
  localize: Translator["localize"] = (text) => createTranslator(DEFAULT_LANGUAGE).localize(text),
): Resolution {
  try {
    const { path, rest, hasHelpFlag, hasVersionFlag, hasIntrospectFlag } = parsePath(
      argv,
      localize,
    );
    const target = registry.locate(path);

    if (target.kind === "unknown" && !hasVersionFlag && !hasHelpFlag) {
      return { kind: "usageError", error: target.error };
    }

    const definitions: FlagsDef =
      target.kind === "leaf"
        ? {
            ...GLOBAL_FLAGS,
            ...credentialFlagDefs(target.command),
            ...confirmationFlagDefs(target.command),
            ...target.command.flags,
          }
        : GLOBAL_FLAGS;
    let parsedFlags: Record<string, unknown>;
    try {
      parsedFlags = parseFlags(rest, definitions, localize, {
        enforceRequired:
          target.kind === "leaf" && !hasHelpFlag && !hasVersionFlag && !hasIntrospectFlag,
      });
    } catch (error) {
      // A bare leaf with missing required flags remains an incomplete invocation.
      if (error instanceof UsageError && target.kind === "leaf" && rest.length === 0) {
        return { kind: "help", path: target.matched, parsedFlags: {} };
      }
      throw error;
    }

    if (parsedFlags.timeout !== undefined) {
      const timeoutError = validateTimeout(parsedFlags.timeout);
      if (timeoutError) throw new UsageError(localize(timeoutError));
    }

    if (hasVersionFlag) return { kind: "version" };
    if (hasIntrospectFlag && target.kind !== "unknown") {
      return { kind: "introspect", path: target.matched };
    }

    switch (target.kind) {
      case "leaf":
        return hasHelpFlag
          ? { kind: "help", path: target.matched, parsedFlags }
          : { kind: "run", path: target.matched, command: target.command, rest, parsedFlags };
      case "group":
        return { kind: "help", path: target.matched, parsedFlags };
      case "unknown":
        return { kind: "usageError", error: target.error };
    }
  } catch (error) {
    if (error instanceof UsageError) return { kind: "usageError", error };
    throw error;
  }
}
