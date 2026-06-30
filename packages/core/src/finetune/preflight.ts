/**
 * Finetune job-level pre-flight checks.
 *
 * Sibling to `capability.ts` (the model-capability pre-flight). These checks
 * are NOT dataset-format validations — they consume the per-file validation
 * output (e.g. `stats.totalRecords` from `validateDataset`) together with
 * job-level inputs (hyper-parameters) and decide whether a job is submittable.
 * Format/structure checks live in `dataset/validate/`; these live here because
 * they depend on concerns the format validators must never know about.
 *
 * Consistency with the validate architecture: a failing check returns a
 * `ValidationIssue` (same shape, stable `code`, `error` severity) so callers
 * surface it through the same `BailianError` + issue-list convention used by
 * `bl dataset upload` / `bl dataset validate`. The trigger stays inline in
 * `finetune create` (the only call site today) — that's the job-level boundary.
 */
import type { ValidationIssue } from "../dataset/validate/types.ts";

/** Stable issue code for "too few training samples for the batch size". */
export const INSUFFICIENT_SAMPLES_CODE = "INSUFFICIENT_SAMPLES";

export interface BatchSizeGateInput {
  /**
   * Total training-sample count across all `--datasets` files. Sourced from
   * `validateDataset`'s `stats.totalRecords` (summed per file). The gate only
   * fires when this is known — i.e. every dataset token was a local file that
   * was validated; bare file-id tokens yield no count and fall through to the
   * platform.
   */
  recordCount: number;
  /**
   * Effective batch_size the job will run with — after the CLI's clamp
   * ([8, 1024]) and small-file auto-adjust, or the platform default (16) when
   * neither the user nor auto-adjust set one.
   */
  batchSize: number;
}

export interface BatchSizeGateResult {
  ok: boolean;
  /** Present when `!ok`, in the same shape `validateDataset` issues use. */
  issue?: ValidationIssue;
  /** Actionable guidance; callers surface it as the `BailianError` detail. */
  hint?: string;
}

/**
 * Pre-flight the platform's "training samples must exceed batch_size" rule.
 *
 * The platform rejects a job whose number of training samples is not greater
 * than batch_size, but only surfaces that ~10 minutes into the run (after data
 * processing). This gate fails fast, before upload or quota consumption.
 *
 * Conservative by design — never false-positives: with the platform's default
 * 0.9 train split, training samples = 0.9 * recordCount <= recordCount, so
 * `recordCount <= batchSize` implies training samples <= batchSize implies
 * certain platform failure. Borderline counts (records just above batchSize)
 * may still fail on the platform; that's an acceptable false negative for a
 * pre-check, and the hint nudges users to leave margin for the split.
 */
export function preflightBatchSizeGate(input: BatchSizeGateInput): BatchSizeGateResult {
  const { recordCount, batchSize } = input;
  if (recordCount > batchSize) return { ok: true };
  return {
    ok: false,
    issue: {
      severity: "error",
      code: INSUFFICIENT_SAMPLES_CODE,
      message: `Training dataset has ${recordCount} sample(s), which is not greater than batch_size (${batchSize}).`,
    },
    hint: [
      "The platform requires the number of training samples to exceed batch_size.",
      "Options:",
      "  • add more data (recommended: comfortably more than batch_size, since the",
      "    platform also holds back a default 0.9 train split),",
      "  • lower --batch-size (server clamps to a minimum of 8).",
    ].join("\n"),
  };
}
