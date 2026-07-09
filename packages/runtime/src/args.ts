import type { FlagsDef, ParsedFlags } from "bailian-cli-core";
import { UsageError } from "bailian-cli-core";

function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** maxTokens → max-tokens. For rendering flags in help / error messages. */
export function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
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
 * keyed FlagsDef (key = camelCase flag name). Pure: returns typed flags or
 * throws UsageError — never prints/exits. The error boundary decides rendering.
 */
export function parseFlags<F extends FlagsDef>(rest: string[], defs: F): ParsedFlags<F> {
  const flags: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const [key, def] of Object.entries(defs)) {
    if (def.type === "switch") flags[key] = false;
  }

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
    const rawKey = eqIdx !== -1 ? arg.slice(2, eqIdx) : arg.slice(2);
    let value: string | undefined = eqIdx !== -1 ? arg.slice(eqIdx + 1) : undefined;

    if (rawKey === "") {
      throw new UsageError(`Unknown flag "${arg}".`);
    }
    const key = kebabToCamel(rawKey);
    const def = defs[key];
    if (!def) {
      throw new UsageError(`Unknown flag "--${rawKey}". Run with --help to see available options.`);
    }

    if (def.type === "switch") {
      if (value !== undefined) {
        throw new UsageError(`Flag --${rawKey} is a switch and takes no value.`);
      }
      flags[key] = true;
      i++;
      continue;
    }

    if (value === undefined) {
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new UsageError(`Flag --${rawKey} requires a value.`);
      }
      value = next;
      i += 2;
    } else {
      i += 1;
    }

    if (def.choices && !def.choices.includes(value)) {
      throw new UsageError(`Flag --${rawKey} must be one of: ${def.choices.join(", ")}.`);
    }

    if (def.type === "array") {
      const arr = flags[key] as string[] | undefined;
      if (arr) arr.push(value);
      else flags[key] = [value];
      continue;
    }

    if (seen.has(key)) {
      throw new UsageError(`Flag --${rawKey} given more than once.`);
    }
    seen.add(key);

    if (def.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new UsageError(`Flag --${rawKey} requires a finite number.`);
      }
      flags[key] = n;
    } else if (def.type === "boolean") {
      const v = value.trim().toLowerCase();
      if (v === "true") flags[key] = true;
      else if (v === "false") flags[key] = false;
      else throw new UsageError(`Flag --${rawKey} requires true or false.`);
    } else {
      flags[key] = value;
    }
  }

  // Required enforcement — declarative, driven by the schema.
  const missing = Object.entries(defs)
    .filter(
      ([key, def]) => def.type !== "switch" && def.required === true && flags[key] === undefined,
    )
    .map(([key]) => `--${camelToKebab(key)}`);
  if (missing.length > 0) {
    throw new UsageError(
      `Missing required ${missing.length > 1 ? "flags" : "flag"}: ${missing.join(", ")}`,
    );
  }

  return flags as unknown as ParsedFlags<F>;
}
