import { PipelineError } from "./errors.ts";
import type { PipelineDefinition, PipelinePlanStep, PipelineStepReport } from "./types.ts";
import { collectFromDependencies } from "./utils.ts";

export function buildExecutionPlan(pipeline: PipelineDefinition): PipelinePlanStep[] {
  const steps = pipeline.steps.map((step, index) => ({
    step,
    dependencies: [] as string[],
    dependents: [] as string[],
    index: index + 1,
    total: pipeline.steps.length,
  }));
  const byId = new Map(steps.map((item) => [item.step.id, item]));
  for (const item of steps) {
    const dependencies = new Set<string>(item.step.dependsOn ?? []);
    collectFromDependencies(item.step.input, dependencies);
    if (item.step.when !== undefined) collectFromDependencies(item.step.when, dependencies);
    item.dependencies = Array.from(dependencies).sort(
      (a, b) =>
        pipeline.steps.findIndex((step) => step.id === a) -
        pipeline.steps.findIndex((step) => step.id === b),
    );
    for (const dependency of item.dependencies) byId.get(dependency)?.dependents.push(item.step.id);
  }
  return steps;
}

export function topologicalOrder(plan: PipelinePlanStep[]): PipelinePlanStep[] {
  const remaining = new Set(plan.map((item) => item.step.id));
  const done = new Set<string>();
  const ordered: PipelinePlanStep[] = [];
  while (remaining.size > 0) {
    let progressed = false;
    for (const item of plan) {
      if (!remaining.has(item.step.id)) continue;
      if (!item.dependencies.every((dependency) => done.has(dependency))) continue;
      ordered.push(item);
      done.add(item.step.id);
      remaining.delete(item.step.id);
      progressed = true;
    }
    if (!progressed) break;
  }
  return ordered;
}

export function nextReadySteps(
  plan: PipelinePlanStep[],
  remaining: Set<string>,
  reportByStep: Map<string, PipelineStepReport>,
): PipelinePlanStep[] {
  return plan.filter((item) => {
    if (!remaining.has(item.step.id)) return false;
    return item.dependencies.every((id) => {
      const report = reportByStep.get(id);
      return (
        report?.status === "succeeded" ||
        report?.status === "failed" ||
        report?.status === "skipped"
      );
    });
  });
}

export function orderReports(
  plan: PipelinePlanStep[],
  reports: PipelineStepReport[],
): PipelineStepReport[] {
  const index = new Map(plan.map((item, order) => [item.step.id, order]));
  return [...reports].sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
}

export function normalizeConcurrency(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new PipelineError("pipeline_validation_error", "Invalid pipeline execution options", {
      details: { issues: ["concurrency must be a positive integer"] },
    });
  }
  return value;
}
