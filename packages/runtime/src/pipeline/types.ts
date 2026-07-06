// Pipeline types — minimal extraction from packages/pipeline
import type { StepDispatcher } from "./dispatcher.ts";

export const WORKFLOW_VERSION = "workflow/v1";

// --- Step result types (replacing AdapterResult) ---

export interface StepArtifact {
  id?: string;
  path?: string;
  url?: string;
  mediaType?: string;
  taskId?: string;
  kind?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface StepWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface StepResult {
  data?: unknown;
  artifacts?: StepArtifact[];
  warnings?: StepWarning[];
  metadata?: Record<string, unknown>;
}

export interface StructuredStepErrorShape {
  code: string;
  message: string;
  step?: string;
  details?: Record<string, unknown>;
}

// --- JSON Schema types ---

export type JsonSchemaPrimitiveType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "null";

export interface JsonSchema {
  type?: JsonSchemaPrimitiveType | JsonSchemaPrimitiveType[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
  format?: string;
  additionalProperties?: boolean | JsonSchema;
}

// --- Pipeline definition types ---

export type PipelineInputExpression =
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  | unknown
  | { $input: string }
  | { $from: string; path?: string }
  | { $env: string }
  | { $secret: string }
  | { $concat: PipelineInputExpression[] }
  | { $coalesce: PipelineInputExpression[] }
  | { $js: string; args?: Record<string, PipelineInputExpression> };

export type PipelineConditionExpression =
  | boolean
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  | PipelineInputExpression
  | { $exists: PipelineInputExpression }
  | { $eq: [PipelineInputExpression, PipelineInputExpression] }
  | { $ne: [PipelineInputExpression, PipelineInputExpression] }
  | { $gt: [PipelineInputExpression, PipelineInputExpression] }
  | { $gte: [PipelineInputExpression, PipelineInputExpression] }
  | { $lt: [PipelineInputExpression, PipelineInputExpression] }
  | { $lte: [PipelineInputExpression, PipelineInputExpression] }
  | { $in: [PipelineInputExpression, PipelineInputExpression] }
  | { $contains: [PipelineInputExpression, PipelineInputExpression] }
  | { $and: PipelineConditionExpression[] }
  | { $or: PipelineConditionExpression[] }
  | { $not: PipelineConditionExpression };

export interface PipelineRetryPolicy {
  maxAttempts?: number;
  backoff?: "none" | "linear" | "exponential";
}

export interface PipelineBinding {
  from?: "env";
  name: string;
  required?: boolean;
  default?: unknown;
}

export interface PipelineStep {
  id: string;
  type: string;
  input: Record<string, PipelineInputExpression>;
  dependsOn?: string[];
  when?: PipelineConditionExpression;
  retry?: PipelineRetryPolicy;
  timeout?: string | number;
}

export interface PipelineDefinition {
  version: typeof WORKFLOW_VERSION;
  inputs?: JsonSchema;
  env?: Record<string, string | PipelineBinding>;
  secrets?: Record<string, string | PipelineBinding>;
  steps: PipelineStep[];
}

// --- Execution report types ---

export interface PipelineStepReport {
  id: string;
  type: string;
  status: "planned" | "succeeded" | "failed" | "skipped";
  dependencies?: string[];
  input?: Record<string, unknown>;
  output?: StepResult;
  error?: StructuredStepErrorShape;
  startedAt?: string;
  finishedAt?: string;
  attempts?: number;
  skipReason?: string;
  condition?: "pending" | "true" | "false";
}

export interface PipelineExecutionReport {
  status: "planned" | "succeeded" | "failed";
  version: typeof WORKFLOW_VERSION;
  steps: PipelineStepReport[];
  artifacts: StepArtifact[];
}

// --- Lifecycle event types ---

export interface PipelineEventStep {
  id: string;
  type: string;
  dependencies?: string[];
  index?: number;
  total?: number;
}

export interface PipelineEventTiming {
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface PipelineEventInputSummary {
  keys: string[];
  redactedKeys?: string[];
}

export interface PipelineEventOutputSummary {
  dataType?: string;
  artifactCount: number;
  warningCount: number;
  metadata?: Record<string, unknown>;
}

export type PipelineLifecycleEvent =
  | {
      type: "pipeline.started";
      timestamp: string;
      status: "running" | "planned";
      stepCount: number;
      dryRun: boolean;
    }
  | {
      type: "step.input.resolved";
      timestamp: string;
      status: "running" | "planned";
      step: PipelineEventStep;
      input: PipelineEventInputSummary;
    }
  | {
      type: "step.planned";
      timestamp: string;
      status: "planned";
      step: PipelineEventStep;
      input: PipelineEventInputSummary;
      condition?: "pending";
    }
  | {
      type: "step.started";
      timestamp: string;
      status: "running";
      step: PipelineEventStep;
      timing: PipelineEventTiming;
      attempt: number;
    }
  | {
      type: "step.retrying";
      timestamp: string;
      status: "running";
      step: PipelineEventStep;
      attempt: number;
      nextAttempt: number;
      error: StructuredStepErrorShape;
    }
  | {
      type: "artifact.created";
      timestamp: string;
      status: "running";
      step: PipelineEventStep;
      artifact: StepArtifact;
    }
  | {
      type: "step.succeeded";
      timestamp: string;
      status: "running";
      step: PipelineEventStep;
      timing: PipelineEventTiming;
      output: PipelineEventOutputSummary;
      attempt: number;
      warnings?: StepWarning[];
    }
  | {
      type: "step.skipped";
      timestamp: string;
      status: "running" | "planned";
      step: PipelineEventStep;
      reason: string;
    }
  | {
      type: "step.failed";
      timestamp: string;
      status: "failed";
      step: PipelineEventStep;
      timing: PipelineEventTiming;
      attempt: number;
      error: StructuredStepErrorShape;
    }
  | {
      type: "pipeline.planned";
      timestamp: string;
      status: "planned";
      stepCount: number;
      artifactCount: number;
    }
  | {
      type: "pipeline.succeeded";
      timestamp: string;
      status: "succeeded";
      stepCount: number;
      artifactCount: number;
    }
  | {
      type: "step.polling";
      timestamp: string;
      status: "running";
      step: PipelineEventStep;
      taskId: string;
      taskStatus: string;
      elapsedMs: number;
      pollAttempt: number;
    }
  | {
      type: "pipeline.failed";
      timestamp: string;
      status: "failed";
      stepCount: number;
      artifactCount: number;
      failedStep: PipelineEventStep;
      error: StructuredStepErrorShape;
    };

export type PipelineEventHandler = (event: PipelineLifecycleEvent) => void | Promise<void>;

// --- Execution options ---

export interface ExecutePipelineOptions {
  onEvent?: PipelineEventHandler;
  concurrency?: number;
  retryDelayBaseMs?: number;
  sleep?: (ms: number) => Promise<void>;
  basePath?: string;
  dryRun?: boolean;
  signal?: AbortSignal;
  timeoutSeconds?: number;
  blRequestTimeoutSeconds?: number;
  stepDispatcher?: StepDispatcher;
}

// --- Scheduler types ---

export interface PipelinePlanStep {
  step: PipelineStep;
  dependencies: string[];
  dependents: string[];
  index: number;
  total: number;
}

export type ResolvedExpression = {
  value: unknown;
  redacted: unknown;
  sensitive: boolean;
  exists: boolean;
};

// --- Step output schema types ---

export interface StepOutputPath {
  path: string;
  description: string;
}

export interface StepOutputSchema {
  description?: string;
  paths: StepOutputPath[];
}

// --- Step handler types ---

export type StepHandler = (
  input: Record<string, unknown>,
  ctx: StepContext,
) => Promise<StepResult> | StepResult;

export interface StepContext {
  dryRun: boolean;
  signal?: AbortSignal;
  timeoutSeconds?: number;
  blRequestTimeoutSeconds?: number;
  emitEvent?: (event: Record<string, unknown>) => void | Promise<void>;
  blEnv?: unknown;
}
