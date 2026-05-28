import type { StructuredStepErrorShape } from "./types.ts";

export class PipelineError extends Error {
  readonly code: string;
  readonly step?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options?: { step?: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.step = options?.step;
    this.details = options?.details;
  }

  toJSON(): StructuredStepErrorShape {
    return {
      code: this.code,
      message: this.message,
      ...(this.step ? { step: this.step } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class PipelineValidationError extends PipelineError {
  readonly issues: string[];

  constructor(message: string, issues: string[], step?: string) {
    super("pipeline_validation_error", message, { step, details: { issues } });
    this.issues = issues;
  }
}

export function toPipelineError(err: unknown, step?: string): PipelineError {
  if (err instanceof PipelineError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new PipelineError("step_execution_error", message, { step });
}
