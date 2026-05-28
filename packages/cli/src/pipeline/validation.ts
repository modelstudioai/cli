import { PipelineError } from "./errors.ts";
import { getDefaultStepDispatcher, type StepDispatcher } from "./dispatcher.ts";
import { validateInputAgainstSchema } from "./schema.ts";
import { validateJsonSchema } from "./schema.ts";
import type { PipelineDefinition } from "./types.ts";
import { WORKFLOW_VERSION } from "./types.ts";
import { collectFromDependencies, isRecord, parseTimeoutSeconds } from "./utils.ts";

export function collectPipelineIssues(
  pipeline: PipelineDefinition,
  dispatcher: StepDispatcher = getDefaultStepDispatcher(),
): string[] {
  const structuralIssues = validateWorkflowStructure(pipeline);
  if (structuralIssues.length > 0) return structuralIssues;
  return collectPipelineSemanticIssues(pipeline, dispatcher);
}

/**
 * Collect non-blocking hints about potentially invalid $from paths.
 * These do not prevent execution but help workflow authors catch typos.
 */
export function collectPipelineHints(
  pipeline: PipelineDefinition,
  dispatcher: StepDispatcher = getDefaultStepDispatcher(),
): string[] {
  const structuralIssues = validateWorkflowStructure(pipeline);
  if (structuralIssues.length > 0) return [];
  const hints: string[] = [];
  const stepTypeById = new Map(pipeline.steps.map((s) => [s.id, s.type]));
  for (const step of pipeline.steps) {
    validateFromPaths(step.input, step.id, stepTypeById, dispatcher, hints);
  }
  return hints;
}

export function validatePipelineRuntimeInput(
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown>,
): Record<string, unknown> {
  if (!pipeline.inputs) return runtimeInput;
  const result = validateInputAgainstSchema(pipeline.inputs, runtimeInput);
  if (result.ok) return result.value;
  throw new PipelineError("pipeline_validation_error", "Invalid pipeline runtime input", {
    details: { issues: result.issues },
  });
}

export function validatePipeline(
  pipeline: PipelineDefinition,
  dispatcher: StepDispatcher = getDefaultStepDispatcher(),
): void {
  const issues = collectPipelineIssues(pipeline, dispatcher);
  if (issues.length > 0) {
    throw new PipelineError("pipeline_validation_error", "Invalid pipeline definition", {
      details: { issues },
    });
  }
}

function validateWorkflowStructure(pipeline: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(pipeline)) {
    issues.push("structural: pipeline must be an object");
    return issues;
  }
  if (pipeline.version !== WORKFLOW_VERSION) {
    issues.push(`structural: pipeline.version must be "${WORKFLOW_VERSION}"`);
  }
  if (!Array.isArray(pipeline.steps)) {
    issues.push("structural: pipeline.steps must be an array");
    return issues;
  }
  if (pipeline.steps.length === 0) {
    issues.push("structural: pipeline.steps must contain at least one step");
  }
  for (const [index, step] of pipeline.steps.entries()) {
    if (!isRecord(step)) {
      issues.push(`structural: step at index ${index} must be an object`);
      continue;
    }
    if (!step.id || typeof step.id !== "string") {
      issues.push(`structural: step at index ${index} must have a string id`);
    }
    if (!step.type || typeof step.type !== "string") {
      issues.push(`structural: step at index ${index} must have a string type`);
    }
    if (!isRecord(step.input)) {
      issues.push(`structural: step at index ${index} must have an input object`);
    }
  }
  return issues;
}

function collectPipelineSemanticIssues(
  pipeline: PipelineDefinition,
  dispatcher: StepDispatcher,
): string[] {
  const issues: string[] = [];
  if (pipeline.inputs) {
    issues.push(...validateJsonSchema(pipeline.inputs, "pipeline.inputs"));
  }
  const steps = pipeline.steps;
  const stepIds = new Set<string>();

  for (const [index, step] of steps.entries()) {
    const stepLabel = step.id || `#${index}`;

    if (stepIds.has(step.id)) issues.push(`duplicate step id "${step.id}"`);
    stepIds.add(step.id);

    if (!dispatcher.hasStep(step.type)) {
      issues.push(`semantic: step "${stepLabel}" references unknown type "${step.type}"`);
    }

    if (
      step.dependsOn !== undefined &&
      (!Array.isArray(step.dependsOn) || !step.dependsOn.every((item) => typeof item === "string"))
    ) {
      issues.push(`semantic: step "${stepLabel}" dependsOn must be an array of step id strings`);
    }

    if (step.retry !== undefined) validateRetryPolicy(step.retry, stepLabel, issues);
    if (step.timeout !== undefined && parseTimeoutSeconds(step.timeout) === undefined) {
      issues.push(
        `semantic: step "${stepLabel}" timeout must be a positive number of seconds or duration string`,
      );
    }
  }

  // Check dependency references
  for (const step of steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!stepIds.has(dep)) {
        issues.push(`semantic: step "${step.id}" references missing step "${dep}"`);
      }
      if (dep === step.id) {
        issues.push(`semantic: step "${step.id}" references itself`);
      }
    }
    // Check $from references in input
    collectFromReferences(step.input, step.id, stepIds, issues);
  }

  // Cycle detection
  const dependencies = new Map<string, Set<string>>();
  for (const step of steps) {
    const deps = new Set<string>(step.dependsOn ?? []);
    collectFromDependencies(step.input, deps);
    if (step.when !== undefined) collectFromDependencies(step.when, deps);
    dependencies.set(step.id, deps);
  }
  for (const cycle of findCycles(dependencies)) {
    issues.push(`semantic: pipeline graph contains cycle: ${cycle.join(" -> ")}`);
  }

  return issues;
}

function collectFromReferences(
  value: unknown,
  stepId: string,
  stepIds: Set<string>,
  issues: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFromReferences(item, stepId, stepIds, issues));
    return;
  }
  if (!isRecord(value)) return;
  if ("$from" in value && typeof value.$from === "string") {
    if (!stepIds.has(value.$from)) {
      issues.push(`semantic: step "${stepId}" $from references missing step "${value.$from}"`);
    }
  }
  for (const child of Object.values(value)) {
    collectFromReferences(child, stepId, stepIds, issues);
  }
}

function validateRetryPolicy(policy: unknown, stepLabel: string, issues: string[]): void {
  if (!isRecord(policy)) {
    issues.push(`step "${stepLabel}" retry must be an object`);
    return;
  }
  const maxAttempts = policy.maxAttempts;
  if (
    maxAttempts !== undefined &&
    (typeof maxAttempts !== "number" || !Number.isInteger(maxAttempts) || maxAttempts < 1)
  ) {
    issues.push(`step "${stepLabel}" retry.maxAttempts must be a positive integer`);
  }
  if (
    policy.backoff !== undefined &&
    policy.backoff !== "none" &&
    policy.backoff !== "linear" &&
    policy.backoff !== "exponential"
  ) {
    issues.push(`step "${stepLabel}" retry.backoff must be none, linear, or exponential`);
  }
}

function validateFromPaths(
  value: unknown,
  stepId: string,
  stepTypeById: Map<string, string>,
  dispatcher: StepDispatcher,
  issues: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => validateFromPaths(item, stepId, stepTypeById, dispatcher, issues));
    return;
  }
  if (!isRecord(value)) return;
  if ("$from" in value && typeof value.$from === "string" && typeof value.path === "string") {
    const sourceType = stepTypeById.get(value.$from);
    if (sourceType) {
      const schema = dispatcher.getOutputSchema(sourceType);
      if (schema) {
        const path = value.path as string;
        const matched = schema.paths.some((p) => path === p.path || path.startsWith(p.path + "/"));
        if (!matched) {
          const available = schema.paths.map((p) => p.path).join(", ");
          issues.push(
            `hint: step "${stepId}" references path "${path}" from "${value.$from}" (${sourceType}), ` +
              `which is not a known output path. Known paths: ${available}`,
          );
        }
      }
    }
    return;
  }
  for (const child of Object.values(value)) {
    validateFromPaths(child, stepId, stepTypeById, dispatcher, issues);
  }
}

function findCycles(dependencies: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string) => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (dependencies.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of dependencies.keys()) visit(id);
  return cycles;
}
