/**
 * Validator types — the registry contract that every format adheres to.
 *
 * Design (Plan B from the architecture review):
 *  - A `ValidatorSpec` is a plain object, not a class. Adding a new format =
 *    one new file exporting one constant + one line in the registry.
 *  - Common pre-flight checks (existence, size, extension) live in `common.ts`
 *    and are applied by `validateDataset` before the format-specific validator
 *    runs, so individual specs only handle structural concerns.
 */

export interface ValidateOpts {
  /** When true, validators should do exhaustive checks (e.g. parse every line). */
  fullValidate?: boolean;
  /** Optional max bytes override (defaults to 300MB at the registry level). */
  maxBytes?: number;
  /** Optional abort signal for long-running scans. */
  signal?: AbortSignal;
  /**
   * Record-schema selector for formats that carry more than one schema under
   * the same extension. Today only the `.jsonl` ChatML family honors it:
   *   - `"chatml"` — `{messages: [...]}` (SFT). `chosen`/`rejected` ignored.
   *   - `"dpo"`    — `{messages: [...], chosen: {role,content}, rejected: {...}}`.
   *                   Every record MUST carry `chosen` + `rejected`.
   *   - `undefined` — auto-detect per record: a record with `chosen` or
   *                   `rejected` is validated as DPO, otherwise as ChatML.
   * `finetune create` sets this from `--training-type` (dpo* → "dpo") so a DPO
   * job with malformed preference pairs fails at validate time, not on the
   * platform ten minutes in.
   */
  schema?: DatasetSchema;
}

/** The schemas a `.jsonl` record can be validated against. */
export type DatasetSchema = "chatml" | "dpo";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Stable machine-readable key, e.g. "EMPTY_FILE", "MALFORMED_JSON". */
  code: string;
  /** Human-readable message. */
  message: string;
  /** 1-indexed line number for line-oriented formats. */
  line?: number;
  /** Optional path inside the offending row, e.g. "messages[2].role". */
  path?: string;
}

export interface ValidationStats {
  /** Total observed records (rows / samples / messages, depending on format). */
  totalRecords?: number;
  /** Records actually deep-checked (sampled). */
  sampledRecords?: number;
  /** Total file bytes. */
  bytes?: number;
  /** Wall time spent in the scan (ms). */
  durationMs?: number;
}

export interface ValidationResult {
  valid: boolean;
  format: string;
  filePath: string;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: ValidationStats;
}

export interface ValidatorSpec {
  /** Human-readable format identifier, e.g. "jsonl". */
  format: string;
  /** Lower-cased file extensions handled by this validator (include dot). */
  extensions: string[];
  /** Format-specific check. Pre-flight (existence/size) is applied by the registry. */
  validate(filePath: string, opts: ValidateOpts): Promise<ValidationResult>;
}
