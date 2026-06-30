/**
 * Validator registry — single point of truth for which formats are supported.
 *
 * Routing today is "extension → spec". If a future dataset purpose introduces
 * a different schema under the same extension (e.g. a non-ChatML evaluation
 * .jsonl), extend `pickValidator` to also accept a `purpose` discriminator
 * and add purpose-specific specs to the registry — no other call site needs
 * to change.
 *
 * To add a new format:
 *   1. Create `<format>.ts` exporting a `ValidatorSpec` constant.
 *   2. Import it here and append to `REGISTRY`.
 * That's it. Nothing else in this folder needs to change.
 */
import { extname } from "path";
import { BailianError } from "../../errors/base.ts";
import { ExitCode } from "../../errors/codes.ts";
import { jsonlValidator } from "./jsonl.ts";
import { preflight, MAX_DATASET_BYTES } from "./common.ts";
import type { ValidatorSpec, ValidateOpts, ValidationResult } from "./types.ts";

const REGISTRY: ValidatorSpec[] = [jsonlValidator];

/** Lookup the validator that handles a given file extension. */
export function pickValidator(filePath: string): ValidatorSpec {
  const ext = extname(filePath).toLowerCase();
  const v = REGISTRY.find((s) => s.extensions.includes(ext));
  if (!v) {
    const supported = REGISTRY.flatMap((s) => s.extensions).join(", ");
    throw new BailianError(
      `Unsupported dataset format "${ext || "(none)"}". Supported: ${supported}`,
      ExitCode.USAGE,
      `Convert your data to one of the supported formats and re-run.`,
    );
  }
  return v;
}

/** Allow tests / future plugins to inject extra validators. Idempotent. */
export function registerValidator(spec: ValidatorSpec): void {
  if (REGISTRY.some((s) => s.format === spec.format)) return;
  REGISTRY.push(spec);
}

/**
 * Top-level entry point. Applies common pre-flight (existence/size/extension)
 * then defers to the format-specific validator.
 */
export async function validateDataset(
  filePath: string,
  opts: ValidateOpts = {},
): Promise<ValidationResult> {
  const maxBytes = opts.maxBytes ?? MAX_DATASET_BYTES;
  const { bytes } = preflight(filePath, maxBytes);
  const spec = pickValidator(filePath);
  const result = await spec.validate(filePath, opts);
  // Stitch the file size into stats if the validator didn't.
  if (result.stats.bytes === undefined) {
    result.stats.bytes = bytes;
  }
  return result;
}

/** Read-only view of the active registry — handy for tests / `--help`. */
export function listSupportedFormats(): { format: string; extensions: string[] }[] {
  return REGISTRY.map((s) => ({ format: s.format, extensions: [...s.extensions] }));
}
