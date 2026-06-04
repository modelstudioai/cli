import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { Config } from "../config/schema.ts";

/** Parse true/false from CLI flags or `bl config set --key watermark --value …`. */
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

/** Command `--watermark` overrides `config.watermark`; default true when both unset. */
export function resolveWatermark(config: Config, flagValue: unknown): boolean {
  const fromFlag = parseOptionalBooleanValue(flagValue, "watermark");
  if (fromFlag !== undefined) return fromFlag;
  if (config.watermark !== undefined) return config.watermark;
  return true;
}
