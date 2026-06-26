import type { Command } from "bailian-cli-core";
import { type UsageError } from "bailian-cli-core";
import type { CommandRegistry } from "./registry.ts";
import { parsePath } from "./args.ts";

/**
 * What an invocation resolves to — "what to do" expressed as data, not control
 * flow. A single pure function (`resolve`) produces one of these; `createCli`'s
 * dispatch switches on it. No scattered `argv.includes(...)` + `process.exit`.
 *  - version: print the version and stop.
 *  - help:    print help for `path` (root [] / a group / an explicit --help). Terminal.
 *  - run:     execute `command`; `rest` is the flag region for parseFlags.
 *  - usageError: the path doesn't exist (or has unexpected args); render and stop.
 */
export type Resolution =
  | { kind: "version" }
  | { kind: "help"; path: string[] }
  | { kind: "run"; path: string[]; command: Command; rest: string[] }
  | { kind: "usageError"; error: UsageError };

/**
 * Classify argv into a {@link Resolution}. Pure over (argv, registry): one
 * `parsePath` scan for the command path + flag region, one `registry.locate`
 * for the routing decision. Never throws. Trivially unit-testable.
 */
export function resolve(argv: string[], registry: CommandRegistry): Resolution {
  const { path, rest, hasHelpFlag, hasVersionFlag } = parsePath(argv);
  if (hasVersionFlag) return { kind: "version" };

  const target = registry.locate(path);
  switch (target.kind) {
    case "leaf":
      return hasHelpFlag
        ? { kind: "help", path: target.matched }
        : { kind: "run", path: target.matched, command: target.command, rest };
    case "group":
      return { kind: "help", path: target.matched };
    case "unknown":
      return { kind: "usageError", error: target.error };
  }
}
