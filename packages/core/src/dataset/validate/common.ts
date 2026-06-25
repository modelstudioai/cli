/**
 * Common pre-flight guards shared by every dataset validator.
 *
 * Keeping these here means new format validators only worry about structural
 * concerns — they don't have to redo existence / size / extension checks,
 * and we get one place to tune limits if the platform changes them.
 */
import { existsSync, statSync } from "fs";
import { extname } from "path";
import { BailianError } from "../../errors/base.ts";
import { ExitCode } from "../../errors/codes.ts";
import type { DatasetSchema, ValidationIssue, ValidationStats } from "./types.ts";

/**
 * The platform caps dataset uploads at 300MB per file. `bl dataset upload`
 * enforces this client-side so users learn early. Update if the platform
 * raises the cap or differentiates per-purpose limits.
 */
export const MAX_DATASET_BYTES = 300 * 1024 * 1024;

export interface PreflightResult {
  bytes: number;
  ext: string;
}

/**
 * Validate that the path exists, is a file, and (optionally) within the size
 * cap. Throws a USAGE-coded BailianError on user-visible problems so callers
 * fail fast with a clean exit code.
 */
export function preflight(filePath: string, maxBytes = MAX_DATASET_BYTES): PreflightResult {
  if (!existsSync(filePath)) {
    throw new BailianError(`File not found: ${filePath}`, ExitCode.USAGE);
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) {
    throw new BailianError(`Not a regular file: ${filePath}`, ExitCode.USAGE);
  }
  if (stat.size === 0) {
    throw new BailianError(`File is empty: ${filePath}`, ExitCode.USAGE);
  }
  if (stat.size > maxBytes) {
    const mb = (stat.size / (1024 * 1024)).toFixed(1);
    const cap = (maxBytes / (1024 * 1024)).toFixed(0);
    throw new BailianError(
      `File too large: ${mb}MB exceeds the ${cap}MB dataset upload cap.`,
      ExitCode.USAGE,
    );
  }
  return {
    bytes: stat.size,
    ext: extname(filePath).toLowerCase(),
  };
}

export function makeIssue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  extra: Partial<Pick<ValidationIssue, "line" | "path">> = {},
): ValidationIssue {
  return { severity, code, message, ...extra };
}

export function emptyStats(): ValidationStats {
  return {};
}

/**
 * Parse a `--schema` CLI value into a `DatasetSchema` (or `undefined` for
 * auto-detect). Single source of truth for the schema vocabulary so `dataset
 * validate`, `dataset upload`, and any future caller agree on accepted values
 * and error wording. Throws USAGE for anything unrecognized.
 */
export function parseDatasetSchemaFlag(value: string | undefined): DatasetSchema | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const v = value.trim();
  if (v === "chatml" || v === "dpo") return v;
  throw new BailianError(
    `Unsupported --schema "${value}". Supported: chatml, dpo.`,
    ExitCode.USAGE,
    `Omit --schema to auto-detect per record (a record with chosen/rejected is treated as DPO).`,
  );
}

/** Produce a deterministic set of sample line indices for deep checking.
 *  Indices are 1-based to match what users see in editors / error messages.
 *
 *  Strategy: front 50 + ~100 evenly spaced + last 10. Capped, deduped, sorted.
 */
export function pickSampleLines(totalLines: number, frontN = 50, midN = 100, tailN = 10): number[] {
  if (totalLines <= 0) return [];
  if (totalLines <= frontN + tailN) {
    return Array.from({ length: totalLines }, (_, i) => i + 1);
  }
  const set = new Set<number>();
  for (let i = 1; i <= Math.min(frontN, totalLines); i++) set.add(i);
  for (let i = 0; i < tailN; i++) set.add(totalLines - i);
  const step = Math.max(1, Math.ceil(totalLines / midN));
  for (let i = frontN + 1; i <= totalLines - tailN; i += step) set.add(i);
  return [...set].filter((n) => n >= 1 && n <= totalLines).sort((a, b) => a - b);
}
