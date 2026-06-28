import type { Config } from "../config/schema.ts";
import type { Client } from "../client/client.ts";

// ── Flag definitions ─────────────────────────────────────────────────────────
// Flags are keyed by camelCase name (the key IS the parsed flag name, e.g.
// `maxTokens` ↔ `--max-tokens`). The flag's type drives both runtime parsing
// and the compile-time flag types inferred via ParsedFlags.

/** A presence flag: `--quiet`. No value; absent → false. */
export interface SwitchFlag {
  type: "switch";
  description: string;
}
/** A value flag: `--prompt <text>`, `--n <count>`, `--watermark true|false`. */
export interface ValueFlag {
  type: "string" | "number" | "boolean" | "array";
  description: string;
  valueHint: string;
  required?: boolean;
  /**
   * Restrict to a fixed set of values. The parser rejects anything else and the
   * parsed type narrows to the union. Declare with `as const` so the literals
   * survive inference: `choices: ["mp3", "wav"] as const`.
   */
  choices?: readonly string[];
}
export type FlagDef = SwitchFlag | ValueFlag;
export type FlagsDef = Record<string, FlagDef>;

// ── Type inference: definition → parsed flag types ───────────────────────────
type ParsedValue<F extends FlagDef> = F extends SwitchFlag
  ? boolean
  : F extends { type: "number" }
    ? number
    : F extends { type: "boolean" }
      ? boolean
      : F extends { choices: readonly (infer C extends string)[] }
        ? F extends { type: "array" }
          ? C[]
          : C
        : F extends { type: "array" }
          ? string[]
          : string;

/** Switches and `required` value flags are present; other value flags optional. */
type IsRequired<F extends FlagDef> = F extends SwitchFlag
  ? true
  : F extends { required: true }
    ? true
    : false;

/**
 * Map a FlagsDef to the parsed flags object type. Required flags (switches +
 * `required: true`) are required properties; optional value flags are `?`.
 */
export type ParsedFlags<F extends FlagsDef> = {
  [K in keyof F as IsRequired<F[K]> extends true ? K : never]: ParsedValue<F[K]>;
} & {
  [K in keyof F as IsRequired<F[K]> extends true ? never : K]?: ParsedValue<F[K]>;
};

export type AuthRequirement = "apiKey" | "console" | "none";

// ── Global flags (single source: derived from GLOBAL_FLAGS) ──────────────────
export const GLOBAL_FLAGS = {
  apiKey: { type: "string", valueHint: "<key>", description: "API key" },
  baseUrl: { type: "string", valueHint: "<url>", description: "API base URL" },
  output: { type: "string", valueHint: "<format>", description: "Output format: text, json" },
  timeout: { type: "number", valueHint: "<seconds>", description: "Request timeout" },
  concurrent: {
    type: "number",
    valueHint: "<n>",
    description: "Run N parallel requests (default: 1)",
  },
  quiet: { type: "switch", description: "Suppress non-essential output" },
  verbose: { type: "switch", description: "Print HTTP request/response details" },
  noColor: { type: "switch", description: "Disable ANSI colors" },
  dryRun: { type: "switch", description: "Dry run mode" },
  nonInteractive: { type: "switch", description: "Disable interactive prompts" },
  yes: { type: "switch", description: "Skip confirmation prompts" },
  async: { type: "switch", description: "Return async task id without waiting" },
  consoleRegion: {
    type: "string",
    valueHint: "<region>",
    description: "Console gateway region (e.g. cn-beijing, ap-southeast-1)",
  },
  consoleSite: {
    type: "string",
    valueHint: "<site>",
    description: "Console site: domestic, international",
  },
  consoleSwitchAgent: {
    type: "number",
    valueHint: "<uid>",
    description: "Switch agent UID for delegated access",
  },
  help: { type: "switch", description: "Show help" },
  version: { type: "switch", description: "Print version" },
} satisfies FlagsDef;

export type GlobalFlags = ParsedFlags<typeof GLOBAL_FLAGS>;
/** A command's full flags: global + its own flags, inferred in one pass. */
export type Flags<F extends FlagsDef> = ParsedFlags<typeof GLOBAL_FLAGS & F>;

/**
 * What a command's `run` receives: use `client` for all network calls (its
 * credential is already injected per the command's `auth`), `config` for
 * settings, and `flags` for parsed arguments. Never handle tokens or baseUrl.
 */
export interface CommandContext<F extends FlagsDef = FlagsDef> {
  /** Network surface; the credential for the command's `auth` is pre-injected. */
  client: Client;
  config: Config;
  flags: Flags<F>;
}

// ── Command ──────────────────────────────────────────────────────────────────
/**
 * A command. Generic over its flags `F` so `run`/`validate` receive precisely
 * typed flags (`Flags<F>` = global + own flags). Stored heterogeneously as
 * {@link AnyCommand}; the precise typing lives at the `defineCommand` call site.
 */
export interface Command<F extends FlagsDef = FlagsDef> {
  description: string;
  /** Credential this command requires. See {@link AuthRequirement}. */
  auth: AuthRequirement;
  /** Usage line arg portion, e.g. "--prompt <text> [flags]". Manually written. */
  usageArgs?: string;
  /** Example arg strings (without the `<bin> <path>` prefix). */
  exampleArgs?: string[];
  notes?: string[];
  flags?: F;
  /**
   * Cross-flag validation, after parsing and before run. Return an error message
   * → UsageError; undefined to pass. Single-flag `required` is enforced by the
   * parser — use this for rules spanning flags or depending on a flag's *value*.
   */
  validate?: (flags: Flags<F>) => string | undefined;
  run: (ctx: CommandContext<F>) => Promise<void>;
}

/** Type-erased command for heterogeneous storage (registry / context). */
export type AnyCommand = Command<any>;

/** Identity wrapper whose only job is to infer `F` from `spec.flags`. */
export function defineCommand<F extends FlagsDef>(spec: Command<F>): Command<F> {
  return spec;
}
