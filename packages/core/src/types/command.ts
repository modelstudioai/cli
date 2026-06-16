import type { Config } from "../config/schema.ts";
import type { GlobalFlags } from "./flags.ts";

export interface OptionDef {
  flag: string;
  description: string;
  type?: "string" | "number" | "boolean" | "array";
  required?: boolean;
}

export interface Command {
  name: string;
  description: string;
  usage?: string;
  options?: OptionDef[];
  examples?: string[];
  /**
   * When true, the CLI entrypoint skips the default DashScope API key prompt
   * (`ensureApiKey`) and the optional status bar credential resolution; the
   * command implements its own auth (Console token, AK/SK, pipeline-only, etc.).
   */
  skipDefaultApiKeySetup?: boolean;
  execute: (config: Config, flags: GlobalFlags) => Promise<void>;
}

export interface CommandSpec {
  name: string;
  description: string;
  usage?: string;
  options?: OptionDef[];
  examples?: string[];
  skipDefaultApiKeySetup?: boolean;
  run: (config: Config, flags: GlobalFlags) => Promise<void>;
}

export function defineCommand(spec: CommandSpec): Command {
  return {
    name: spec.name,
    description: spec.description,
    usage: spec.usage,
    options: spec.options,
    examples: spec.examples,
    skipDefaultApiKeySetup: spec.skipDefaultApiKeySetup,
    execute: (config, flags) => spec.run(config, flags),
  };
}

/** Global flags shared by all commands — drives the parser's type resolution. */
export const GLOBAL_OPTIONS: OptionDef[] = [
  { flag: "--api-key <key>", description: "API key" },
  { flag: "--region <region>", description: "API region: cn (default), us, intl" },
  { flag: "--base-url <url>", description: "API base URL" },
  { flag: "--output <format>", description: "Output format: text, json" },
  { flag: "--timeout <seconds>", description: "Request timeout", type: "number" },
  { flag: "--quiet", description: "Suppress non-essential output" },
  { flag: "--verbose", description: "Print HTTP request/response details" },
  { flag: "--no-color", description: "Disable ANSI colors" },
  { flag: "--dry-run", description: "Dry run mode" },
  { flag: "--non-interactive", description: "Disable interactive prompts" },
  { flag: "--concurrent <n>", description: "Run N parallel requests (default: 1)", type: "number" },
  { flag: "--help", description: "Show help" },
  { flag: "--version", description: "Print version" },
];
