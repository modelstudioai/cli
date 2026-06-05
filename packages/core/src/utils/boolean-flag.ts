import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

/** Parse true/false from CLI flags (e.g. `--watermark <bool>`). */
export function parseBooleanValue(value: unknown, label = "boolean"): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  throw new BailianError(
    `Invalid ${label} value "${String(value)}". Use true or false.`,
    ExitCode.USAGE,
  );
}

export function parseOptionalBooleanValue(value: unknown, label = "boolean"): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  return parseBooleanValue(value, label);
}

/**
 * Resolve a tri-state boolean CLI flag (`--name <bool>`).
 * Returns `defaultWhenUnset` when the flag is omitted.
 */
export function resolveBooleanFlag(
  flagValue: unknown,
  defaultWhenUnset: boolean | undefined,
  label = "boolean",
): boolean | undefined {
  const fromFlag = parseOptionalBooleanValue(flagValue, label);
  if (fromFlag !== undefined) return fromFlag;
  return defaultWhenUnset;
}

/** Resolve `--watermark` flag; default true when unset. */
export function resolveWatermark(flagValue: unknown): boolean {
  return parseOptionalBooleanValue(flagValue, "watermark") ?? true;
}
