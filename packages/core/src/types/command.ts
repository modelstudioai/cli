import type { Config } from "../config/schema.ts";
import type { GlobalFlags } from "./flags.ts";

export interface OptionDef {
  flag: string;
  description: string;
  type?: "string" | "number" | "boolean" | "array";
  required?: boolean;
}

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
  skipDefaultApiKeySetup?: boolean;
  notes?: string[];
  execute: (config: Config, flags: GlobalFlags) => Promise<void>;
}

export interface CommandSpec {
  description: string;
  /** See {@link Command.usageArgs} — argument portion only, no `<bin> <path>` prefix. */
  usageArgs?: string;
  options?: OptionDef[];
  /** See {@link Command.exampleArgs} — argument strings only, no `<bin> <path>` prefix. */
  exampleArgs?: string[];
  skipDefaultApiKeySetup?: boolean;
  notes?: string[];
  run: (config: Config, flags: GlobalFlags) => Promise<void>;
}

export function defineCommand(spec: CommandSpec): Command {
  return {
    description: spec.description,
    usageArgs: spec.usageArgs,
    options: spec.options,
    exampleArgs: spec.exampleArgs,
    skipDefaultApiKeySetup: spec.skipDefaultApiKeySetup,
    notes: spec.notes,
    execute: (config, flags) => spec.run(config, flags),
  };
}

/** Global flags shared by all commands — drives the parser's type resolution. */
export const GLOBAL_OPTIONS: OptionDef[] = [
  { flag: "--api-key <key>", description: "API key" },
  { flag: "--base-url <url>", description: "API base URL" },
  { flag: "--output <format>", description: "Output format: text, json" },
  { flag: "--timeout <seconds>", description: "Request timeout", type: "number" },
  { flag: "--quiet", description: "Suppress non-essential output" },
  { flag: "--verbose", description: "Print HTTP request/response details" },
  { flag: "--no-color", description: "Disable ANSI colors" },
  { flag: "--dry-run", description: "Dry run mode" },
  { flag: "--non-interactive", description: "Disable interactive prompts" },
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
  { flag: "--help", description: "Show help" },
  { flag: "--version", description: "Print version" },
];
