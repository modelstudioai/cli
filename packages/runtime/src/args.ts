import type { GlobalFlags } from "bailian-cli-core";
import type { OptionDef } from "bailian-cli-core";
import { UsageError, IncompleteCommandError } from "bailian-cli-core";

function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Extract camelCase flag name from an OptionDef.flag string, e.g. '--max-tokens <n>' → 'maxTokens' */
function flagKey(def: OptionDef): string | null {
  const m = def.flag.match(/^--([a-z][a-z0-9-]*)/i);
  return m ? kebabToCamel(m[1]!) : null;
}

interface FlagSchema {
  switches: Set<string>;
  booleans: Set<string>;
  numbers: Set<string>;
  arrays: Set<string>;
}

function buildAllowedFlagKeys(options: OptionDef[]): Set<string> {
  const keys = new Set<string>();
  for (const opt of options) {
    const key = flagKey(opt);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Classify each option by its declared (or inferred) type. Inference: a flag
 * with a `<…>`/`[…]` placeholder defaults to string, otherwise to switch.
 * Strings are the default bucket and need no set.
 */
function buildSchema(options: OptionDef[]): FlagSchema {
  const switches = new Set<string>();
  const booleans = new Set<string>();
  const numbers = new Set<string>();
  const arrays = new Set<string>();
  for (const opt of options) {
    const key = flagKey(opt);
    if (!key) continue;
    switch (opt.type) {
      case "switch":
        switches.add(key);
        break;
      case "boolean":
        booleans.add(key);
        break;
      case "number":
        numbers.add(key);
        break;
      case "array":
        arrays.add(key);
        break;
      case "string":
        break;
      default:
        if (!opt.flag.includes("<") && !opt.flag.includes("[")) switches.add(key);
    }
  }
  return { switches, booleans, numbers, arrays };
}

export interface ParsePathResult {
  /** Command path: the leading run of bare tokens, e.g. ["speech", "recognize"]. */
  path: string[];
  /** Everything from the first flag onward — handed to parseFlags later. */
  rest: string[];
  hasHelpFlag: boolean;
  hasVersionFlag: boolean;
}

/**
 * First pass — routing only. The command path is the leading run of bare
 * (non-`-`) tokens; the first flag ends it ("command path first, then flags",
 * oclif-style). There are no positionals, so nothing bare can legitimately
 * follow a flag — and no flags precede the path, so this needs no schema.
 */
export function parsePath(argv: string[]): ParsePathResult {
  let i = 0;
  while (i < argv.length && !argv[i]!.startsWith("-")) i++;
  const rest = argv.slice(i);
  return {
    path: argv.slice(0, i),
    rest,
    hasHelpFlag: rest.includes("--help"),
    hasVersionFlag: rest.includes("--version"),
  };
}

/**
 * Second pass — parse the flag region into typed values, driven entirely by the
 * OptionDef schema. Pure: returns typed flags or throws — never prints/exits.
 * The runtime's error boundary decides rendering. Throws IncompleteCommandError
 * for missing required flags (incomplete → help) and UsageError for malformed
 * input (unknown/short flag, bad value, unexpected token, duplicate).
 */
export function parseFlags(rest: string[], options: OptionDef[]): GlobalFlags {
  const allowedKeys = buildAllowedFlagKeys(options);
  const schema = buildSchema(options);
  const seen = new Set<string>();
  const flags: GlobalFlags = {
    quiet: false,
    verbose: false,
    noColor: false,
    yes: false,
    dryRun: false,
    nonInteractive: false,
    async: false,
  };

  let i = 0;
  while (i < rest.length) {
    const arg = rest[i]!;

    if (!arg.startsWith("-")) {
      throw new UsageError(`Unexpected argument: ${arg}`);
    }
    if (!arg.startsWith("--")) {
      throw new UsageError(`Unknown flag "${arg}". Use the --long form.`);
    }

    const eqIdx = arg.indexOf("=");
    const key = eqIdx !== -1 ? arg.slice(2, eqIdx) : arg.slice(2);
    let value: string | undefined = eqIdx !== -1 ? arg.slice(eqIdx + 1) : undefined;

    if (key === "") {
      throw new UsageError(`Unknown flag "${arg}".`);
    }
    const camelKey = kebabToCamel(key);
    if (!allowedKeys.has(camelKey)) {
      throw new UsageError(`Unknown flag "--${key}". Run with --help to see available options.`);
    }

    if (schema.switches.has(camelKey)) {
      if (value !== undefined) {
        throw new UsageError(`Flag --${key} is a switch and takes no value.`);
      }
      (flags as Record<string, unknown>)[camelKey] = true;
      i++;
      continue;
    }

    if (value === undefined) {
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new UsageError(`Flag --${key} requires a value.`);
      }
      value = next;
      i += 2;
    } else {
      i += 1;
    }

    if (schema.arrays.has(camelKey)) {
      const arr = (flags as Record<string, unknown>)[camelKey] as string[] | undefined;
      if (arr) arr.push(value);
      else (flags as Record<string, unknown>)[camelKey] = [value];
      continue;
    }

    if (seen.has(camelKey)) {
      throw new UsageError(`Flag --${key} given more than once.`);
    }
    seen.add(camelKey);

    if (schema.numbers.has(camelKey)) {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new UsageError(`Flag --${key} requires a finite number.`);
      }
      (flags as Record<string, unknown>)[camelKey] = n;
    } else if (schema.booleans.has(camelKey)) {
      const v = value.trim().toLowerCase();
      if (v === "true") (flags as Record<string, unknown>)[camelKey] = true;
      else if (v === "false") (flags as Record<string, unknown>)[camelKey] = false;
      else throw new UsageError(`Flag --${key} requires true or false.`);
    } else {
      (flags as Record<string, unknown>)[camelKey] = value;
    }
  }

  const missing = options.filter((opt) => {
    if (!opt.required) return false;
    const key = flagKey(opt);
    return key !== null && (flags as Record<string, unknown>)[key] === undefined;
  });
  if (missing.length > 0) {
    const names = missing.map((opt) => opt.flag.match(/^(--[a-z][a-z0-9-]*)/i)?.[1] ?? opt.flag);
    throw new IncompleteCommandError(
      `Missing required ${names.length > 1 ? "flags" : "flag"}: ${names.join(", ")}`,
    );
  }

  return flags;
}
