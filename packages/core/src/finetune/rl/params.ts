/**
 * Parsers for the repeatable `KEY=VALUE` style RL flags.
 *
 * Core stays free of runtime flag parsing: the command layer hands raw entry
 * strings here and these helpers turn them into structured assignments.
 * All errors are {@link UsageError} (exit 2) — they describe user input, not
 * server-side failures.
 */

import { UsageError } from "../../errors/base.ts";

/**
 * Parse a scalar by type: boolean / null / JSON object-or-array / number,
 * falling back to the original string. Used for `--hp key=value`.
 */
export function parseTypedValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return raw;
}

/**
 * Parse a value as JSON, falling back to the original string. Used for
 * `--set key=value` (matches the SDK `init(**kwargs)` top-level override).
 */
export function parseJsonValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** A `key=value` assignment split on the first `=`. */
export interface KeyValueAssignment {
  key: string;
  value: string;
}

/**
 * Split `key=value` on the first `=`. Both sides must be non-empty.
 * `formatHint` describes the expected syntax for the error message.
 */
export function parseAssignment(
  entry: string,
  flag: string,
  formatHint: string,
): KeyValueAssignment {
  const separatorIndex = entry.indexOf("=");
  if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
    throw new UsageError(`Invalid ${flag} value "${entry}".`, `Expected ${formatHint}.`);
  }
  return { key: entry.slice(0, separatorIndex), value: entry.slice(separatorIndex + 1) };
}

/** A `name.field=value` assignment (name and field split on the first `.`). */
export interface DottedAssignment {
  name: string;
  field: string;
  value: string;
}

/**
 * Split `name.field=value` into its three parts. Used for `--function-runtime`,
 * `--function-env` and `--reward-metric`. The value may itself contain `.` or
 * `=`; only the first `=` and the first `.` of the left side are separators.
 */
export function parseDottedAssignment(
  entry: string,
  flag: string,
  formatHint: string,
): DottedAssignment {
  const { key, value } = parseAssignment(entry, flag, formatHint);
  const dotIndex = key.indexOf(".");
  if (dotIndex <= 0 || dotIndex === key.length - 1) {
    throw new UsageError(`Invalid ${flag} value "${entry}".`, `Expected ${formatHint}.`);
  }
  return { name: key.slice(0, dotIndex), field: key.slice(dotIndex + 1), value };
}

/** Parse a numeric flag value, rejecting non-finite input. */
export function parseNumericValue(raw: string, flag: string): number {
  const parsed = Number(raw);
  if (raw.trim() === "" || Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new UsageError(`Invalid ${flag} value "${raw}".`, "Expected a finite number.");
  }
  return parsed;
}
