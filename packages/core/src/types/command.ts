import type { Config } from "../config/schema.ts";
import type { GlobalFlags } from "./flags.ts";

/**
 * Flag value type, driving the parser.
 *  - string  : `--flag <value>` → string (default).
 *  - number  : `--flag <n>` → coerced + validated finite number.
 *  - boolean : `--flag true|false` → coerced boolean (a *value* flag).
 *  - switch  : `--flag` → presence = true, takes NO value (`--flag=x` errors).
 *  - array   : repeatable `--flag a --flag b` → string[].
 * Omitting `type`: a flag string with a `<…>`/`[…]` placeholder defaults to
 * string, otherwise to switch.
 */
export interface OptionDef {
  flag: string;
  description: string;
  type?: "string" | "number" | "boolean" | "switch" | "array";
  required?: boolean;
}

/**
 * Credential a command requires. The runtime prepares it before execution.
 *  - "apiKey"  : DashScope API Key. The runtime runs ensureApiKey beforehand,
 *                except under --dry-run (which only prints the request).
 *  - "console" : Console Gateway credential (usage / quota / app list / workspace, …).
 *  - "none"    : No credential (config / auth login flow / pipeline validate / update, …).
 */
export type AuthRequirement = "apiKey" | "console" | "none";

export interface Command {
  description: string;
  /**
   * Argument portion of the usage line, WITHOUT the `<bin> <path>` prefix
   * (e.g. "--index-id <id> --query <text> [flags]"). The runtime prepends the
   * product binary name and the command's actual path when rendering help, so
   * the same command renders correctly under any product (bl / rag / …).
   */
  usageArgs?: string;
  options?: OptionDef[];
  /**
   * Example argument strings, each WITHOUT the `<bin> <path>` prefix
   * (e.g. '--index-id idx_xxx --query "..."'). The runtime prepends
   * `<bin> <path>` per product when rendering help.
   */
  exampleArgs?: string[];
  /** Credential this command requires. See {@link AuthRequirement}. */
  auth: AuthRequirement;
  notes?: string[];
  /**
   * Cross-flag validation, run after parsing and before execute (one-of, 3-of-N,
   * value-conditional, dependency, …). Return an error message → UsageError;
   * undefined to pass. Single-flag `required: true` is enforced by the parser —
   * use this only for rules spanning multiple flags or depending on a flag's *value*.
   */
  validate?: (flags: GlobalFlags) => string | undefined;
  execute: (config: Config, flags: GlobalFlags) => Promise<void>;
}

export interface CommandSpec {
  description: string;
  /** See {@link Command.usageArgs} — argument portion only, no `<bin> <path>` prefix. */
  usageArgs?: string;
  options?: OptionDef[];
  /** See {@link Command.exampleArgs} — argument strings only, no `<bin> <path>` prefix. */
  exampleArgs?: string[];
  /** Credential this command requires. See {@link AuthRequirement}. */
  auth: AuthRequirement;
  notes?: string[];
  /** Cross-flag validation — see {@link Command.validate}. */
  validate?: (flags: GlobalFlags) => string | undefined;
  run: (config: Config, flags: GlobalFlags) => Promise<void>;
}

export function defineCommand(spec: CommandSpec): Command {
  return {
    description: spec.description,
    usageArgs: spec.usageArgs,
    options: spec.options,
    exampleArgs: spec.exampleArgs,
    auth: spec.auth,
    notes: spec.notes,
    validate: spec.validate,
    execute: (config, flags) => spec.run(config, flags),
  };
}

/** Global flags shared by all commands — drives the parser's type resolution. */
export const GLOBAL_OPTIONS: OptionDef[] = [
  { flag: "--api-key <key>", description: "API key" },
  { flag: "--base-url <url>", description: "API base URL" },
  { flag: "--output <format>", description: "Output format: text, json" },
  { flag: "--timeout <seconds>", description: "Request timeout", type: "number" },
  { flag: "--quiet", description: "Suppress non-essential output", type: "switch" },
  { flag: "--verbose", description: "Print HTTP request/response details", type: "switch" },
  { flag: "--no-color", description: "Disable ANSI colors", type: "switch" },
  { flag: "--dry-run", description: "Dry run mode", type: "switch" },
  { flag: "--non-interactive", description: "Disable interactive prompts", type: "switch" },
  { flag: "--concurrent <n>", description: "Run N parallel requests (default: 1)", type: "number" },
  {
    flag: "--console-region <region>",
    description: "Console gateway region (e.g. cn-beijing, ap-southeast-1)",
  },
  { flag: "--console-site <site>", description: "Console site: domestic, international" },
  {
    flag: "--console-switch-agent <uid>",
    description: "Switch agent UID for delegated access",
    type: "number",
  },
  { flag: "--help", description: "Show help", type: "switch" },
  { flag: "--version", description: "Print version", type: "switch" },
];
