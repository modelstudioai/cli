import type { Config } from "../config/schema.ts";
import type { GlobalFlags } from "./flags.ts";

export interface OptionDef {
  flag: string;
  description: string;
  type?: "string" | "number" | "boolean" | "array";
  required?: boolean;
}

type KebabToCamel<S extends string> = S extends `${infer A}-${infer B}`
  ? `${A}${Capitalize<KebabToCamel<B>>}`
  : S;

type ExtractFlagName<S extends string> = S extends `--${infer Name} <${string}>`
  ? KebabToCamel<Name>
  : S extends `--${infer Name} [${string}]`
    ? KebabToCamel<Name>
    : S extends `--no-${infer Name}`
      ? KebabToCamel<Name>
      : S extends `--${infer Name}`
        ? KebabToCamel<Name>
        : never;

type FlagValueType<T extends OptionDef> = T["type"] extends "number"
  ? number
  : T["type"] extends "boolean"
    ? true
    : T["type"] extends "array"
      ? string[]
      : T["flag"] extends `--${string} <${string}>`
        ? string
        : T["flag"] extends `--${string} [${string}]`
          ? string
          : true;

type InferFlags<T extends readonly OptionDef[]> = {
  [K in T[number] as ExtractFlagName<K["flag"]>]?: FlagValueType<K>;
};

export interface Command {
  name: string;
  description: string;
  usage?: string;
  options?: OptionDef[];
  examples?: string[];
  execute: (config: Config, flags: GlobalFlags) => Promise<void>;
}

export interface CommandSpec<Options extends readonly OptionDef[] = OptionDef[]> {
  name: string;
  description: string;
  usage?: string;
  options?: Options;
  examples?: string[];
  run: (config: Config, flags: GlobalFlags & InferFlags<Options>) => Promise<void>;
}

export function defineCommand<const Options extends readonly OptionDef[]>(
  spec: CommandSpec<Options>,
): Command {
  return {
    name: spec.name,
    description: spec.description,
    usage: spec.usage,
    options: spec.options as OptionDef[] | undefined,
    examples: spec.examples,
    execute: (config, flags) => spec.run(config, flags as GlobalFlags & InferFlags<Options>),
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
