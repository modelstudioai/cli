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
import type { FineTuneParamHyperParam } from "./types.ts";

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
  /** Effective batch_size from the user override or the model-specific service default. */
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
      "  • lower --batch-size within the range published for this model and training type.",
    ].join("\n"),
  };
}

export type FineTuneHyperParameterIssueCode =
  | "unsupported"
  | "not_editable"
  | "invalid_type"
  | "not_supported"
  | "out_of_range"
  | "invalid_step";

export interface FineTuneHyperParameterIssue {
  parameter: string;
  value: unknown;
  code: FineTuneHyperParameterIssueCode;
  expected?: string;
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isStepAligned(value: number, origin: number, step: number): boolean {
  const quotient = (value - origin) / step;
  return Math.abs(quotient - Math.round(quotient)) < 1e-9;
}

export function validateFineTuneHyperParameterOverrides(
  schema: FineTuneParamHyperParam[],
  overrides: Record<string, unknown>,
): FineTuneHyperParameterIssue[] {
  const definitions = new Map(
    schema.flatMap((parameter) => (parameter.name ? [[parameter.name, parameter] as const] : [])),
  );
  const issues: FineTuneHyperParameterIssue[] = [];

  for (const [parameter, value] of Object.entries(overrides)) {
    const definition = definitions.get(parameter);
    if (!definition) {
      issues.push({ parameter, value, code: "unsupported" });
      continue;
    }
    if (definition.editable === false) {
      issues.push({ parameter, value, code: "not_editable" });
      continue;
    }

    const serialized = String(value);
    const supportedValues = definition.support_values ?? [];
    if (supportedValues.length > 0 && !supportedValues.includes(serialized)) {
      issues.push({
        parameter,
        value,
        code: "not_supported",
        expected: supportedValues.join(", "),
      });
      continue;
    }

    const range = definition.data_range ?? [];
    const numericType =
      definition.type === "number" ||
      definition.type === "intInputNumber" ||
      definition.type === "floatInputNumber" ||
      range.length === 2 ||
      definition.step !== undefined;
    if (numericType) {
      const numeric = numericValue(value);
      if (
        numeric === undefined ||
        (definition.type === "intInputNumber" && !Number.isInteger(numeric))
      ) {
        issues.push({
          parameter,
          value,
          code: "invalid_type",
          expected: definition.type === "intInputNumber" ? "integer" : "number",
        });
        continue;
      }

      const minimum = numericValue(range[0]);
      const maximum = numericValue(range[1]);
      const belowMinimum =
        minimum !== undefined &&
        (definition.left_range === "exclude" ? numeric <= minimum : numeric < minimum);
      const aboveMaximum =
        maximum !== undefined &&
        (definition.right_range === "exclude" ? numeric >= maximum : numeric > maximum);
      if (belowMinimum || aboveMaximum) {
        const left = definition.left_range === "exclude" ? "(" : "[";
        const right = definition.right_range === "exclude" ? ")" : "]";
        issues.push({
          parameter,
          value,
          code: "out_of_range",
          expected: `${left}${range[0]}, ${range[1]}${right}`,
        });
        continue;
      }

      if (
        definition.step !== undefined &&
        definition.step > 0 &&
        !isStepAligned(numeric, minimum ?? 0, definition.step)
      ) {
        issues.push({
          parameter,
          value,
          code: "invalid_step",
          expected: `step ${definition.step} from ${minimum ?? 0}`,
        });
      }
      continue;
    }

    if (
      value === null ||
      typeof value === "object" ||
      (definition.type === "input" && serialized.trim() === "")
    ) {
      issues.push({
        parameter,
        value,
        code: "invalid_type",
        expected: definition.type ?? "scalar",
      });
    }
  }

  return issues;
}

export function getFineTuneHyperParameterDefaultNumber(
  schema: FineTuneParamHyperParam[],
  parameter: string,
): number | undefined {
  const definition = schema.find((candidate) => candidate.name === parameter);
  return numericValue(definition?.defaultValue ?? definition?.recommend_value);
}
