import { PipelineError, toPipelineError } from "./errors.ts";
import { buildPipelineEnv } from "./bl-config.ts";
import { getDefaultStepDispatcher, type StepDispatcher } from "./dispatcher.ts";
import {
  evaluateCondition,
  redactSensitiveOutput,
  redactStructuredError,
  resolvePlannedStepInput,
  resolveStepInput,
} from "./expressions.ts";
import {
  buildExecutionPlan,
  nextReadySteps,
  normalizeConcurrency,
  orderReports,
  topologicalOrder,
} from "./scheduler.ts";
import {
  OUTPUT_PATH_KEYS,
  checkInputPaths,
  parseTimeoutSeconds,
  preflightCheckInputFiles,
  resolveInputPaths,
} from "./utils.ts";
import { collectPipelineIssues, validatePipelineRuntimeInput } from "./validation.ts";
import {
  WORKFLOW_VERSION,
  type ExecutePipelineOptions,
  type PipelineDefinition,
  type PipelineEventInputSummary,
  type PipelineEventOutputSummary,
  type PipelineEventStep,
  type PipelineEventTiming,
  type PipelineExecutionReport,
  type PipelineLifecycleEvent,
  type PipelinePlanStep,
  type PipelineRetryPolicy,
  type PipelineStep,
  type PipelineStepReport,
  type StepArtifact,
  type StepContext,
  type StepResult,
  type StructuredStepErrorShape,
} from "./types.ts";
export { validatePipeline } from "./validation.ts";

const RETRY_BACKOFF_BASE_MS = 100;

export async function executePipeline(
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown> = {},
  options: ExecutePipelineOptions = {},
): Promise<PipelineExecutionReport> {
  return await executePipelineInternal(pipeline, runtimeInput, options);
}

export async function* streamPipelineEvents(
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown> = {},
  options: Pick<
    ExecutePipelineOptions,
    | "concurrency"
    | "basePath"
    | "dryRun"
    | "signal"
    | "timeoutSeconds"
    | "blRequestTimeoutSeconds"
    | "stepDispatcher"
  > = {},
): AsyncGenerator<PipelineLifecycleEvent> {
  const queue = new AsyncEventQueue<PipelineLifecycleEvent>(1024);
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (options.signal?.aborted) abortFromParent();
  else options.signal?.addEventListener("abort", abortFromParent, { once: true });
  let done = false;
  let error: unknown;

  void executePipelineInternal(pipeline, runtimeInput, {
    ...options,
    signal: controller.signal,
    onEvent: async (event) => {
      await queue.push(event);
    },
  }).then(
    () => {
      done = true;
      queue.close();
    },
    (err) => {
      error = err;
      done = true;
      queue.close();
    },
  );

  try {
    while (!done || queue.size > 0) {
      const event = await queue.shift();
      if (event) {
        yield event;
        continue;
      }
      if (error) throw error;
    }
    if (error) throw error;
  } finally {
    controller.abort();
    options.signal?.removeEventListener("abort", abortFromParent);
    queue.close();
  }
}

async function executePipelineInternal(
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown>,
  options: ExecutePipelineOptions,
): Promise<PipelineExecutionReport> {
  const stepDispatcher = options.stepDispatcher ?? getDefaultStepDispatcher();
  const issues = collectPipelineIssues(pipeline, stepDispatcher);
  if (issues.length > 0) {
    throw new PipelineError("pipeline_validation_error", "Invalid pipeline definition", {
      details: { issues },
    });
  }
  const normalizedRuntimeInput = validatePipelineRuntimeInput(pipeline, runtimeInput);

  if (options.basePath) {
    const preflightIssues = await preflightCheckInputFiles(pipeline.steps, options.basePath);
    if (preflightIssues.length > 0) {
      throw new PipelineError("pipeline_file_not_found", preflightIssues.join("; "), {
        details: { issues: preflightIssues },
      });
    }
  }

  const blEnv = buildPipelineEnv();
  const plan = buildExecutionPlan(pipeline);
  const concurrency = normalizeConcurrency(options.concurrency);
  const reports: PipelineStepReport[] = [];
  const reportByStep = new Map<string, PipelineStepReport>();
  const outputs = new Map<string, StepResult>();
  const artifacts: StepArtifact[] = [];
  const emit = async (event: PipelineLifecycleEvent) => {
    await options.onEvent?.(event);
  };

  await emit({
    type: "pipeline.started",
    timestamp: now(),
    status: options.dryRun ? "planned" : "running",
    stepCount: pipeline.steps.length,
    dryRun: !!options.dryRun,
  });

  if (options.dryRun) {
    for (const planStep of topologicalOrder(plan)) {
      const resolved = resolvePlannedStepInput(planStep.step, pipeline, normalizedRuntimeInput);
      const report: PipelineStepReport = {
        id: planStep.step.id,
        type: planStep.step.type,
        status: "planned",
        dependencies: planStep.dependencies,
        input: resolved.redacted,
        ...(planStep.step.when !== undefined ? { condition: "pending" } : {}),
      };
      reports.push(report);
      await emit({
        type: "step.input.resolved",
        timestamp: now(),
        status: "planned",
        step: stepEvent(planStep),
        input: inputSummary(resolved.redacted, resolved.sensitiveKeys),
      });
      await emit({
        type: "step.planned",
        timestamp: now(),
        status: "planned",
        step: stepEvent(planStep),
        input: inputSummary(resolved.redacted, resolved.sensitiveKeys),
        ...(planStep.step.when !== undefined ? { condition: "pending" as const } : {}),
      });
    }
    await emit({
      type: "pipeline.planned",
      timestamp: now(),
      status: "planned",
      stepCount: reports.length,
      artifactCount: artifacts.length,
    });
    return { status: "planned", version: WORKFLOW_VERSION, steps: reports, artifacts };
  }

  const remaining = new Set(plan.map((item) => item.step.id));
  const inFlight = new Map<string, Promise<PipelineStepReport>>();

  while (remaining.size > 0 || inFlight.size > 0) {
    let progressed = false;
    for (const planStep of nextReadySteps(plan, remaining, reportByStep)) {
      if (inFlight.size >= concurrency) break;
      if (!remaining.has(planStep.step.id)) continue;

      const dependencyReports = planStep.dependencies.map((id) => reportByStep.get(id));
      const failedDependency = dependencyReports.find((report) => report?.status === "failed");
      if (failedDependency) {
        const reason = `dependency ${failedDependency.id} failed`;
        pushReport(reports, reportByStep, {
          id: planStep.step.id,
          type: planStep.step.type,
          status: "skipped",
          dependencies: planStep.dependencies,
          skipReason: reason,
        });
        await emit({
          type: "step.skipped",
          timestamp: now(),
          status: "running",
          step: stepEvent(planStep),
          reason,
        });
        remaining.delete(planStep.step.id);
        progressed = true;
        continue;
      }

      const allDependenciesSkipped =
        dependencyReports.length > 0 &&
        dependencyReports.every((report) => report?.status === "skipped");
      if (allDependenciesSkipped) {
        const reason = "all dependencies skipped";
        pushReport(reports, reportByStep, {
          id: planStep.step.id,
          type: planStep.step.type,
          status: "skipped",
          dependencies: planStep.dependencies,
          skipReason: reason,
        });
        await emit({
          type: "step.skipped",
          timestamp: now(),
          status: "running",
          step: stepEvent(planStep),
          reason,
        });
        remaining.delete(planStep.step.id);
        progressed = true;
        continue;
      }

      const condition =
        planStep.step.when !== undefined
          ? evaluateCondition(planStep.step.when, pipeline, normalizedRuntimeInput, outputs)
          : true;
      if (!condition) {
        const reason = "condition evaluated to false";
        pushReport(reports, reportByStep, {
          id: planStep.step.id,
          type: planStep.step.type,
          status: "skipped",
          dependencies: planStep.dependencies,
          skipReason: reason,
          condition: "false",
        });
        await emit({
          type: "step.skipped",
          timestamp: now(),
          status: "running",
          step: stepEvent(planStep),
          reason,
        });
        remaining.delete(planStep.step.id);
        progressed = true;
        continue;
      }

      const executing = executePlanStep(
        planStep,
        pipeline,
        normalizedRuntimeInput,
        outputs,
        artifacts,
        emit,
        options,
        blEnv,
        stepDispatcher,
      );
      inFlight.set(planStep.step.id, executing);
      remaining.delete(planStep.step.id);
      progressed = true;
    }
    if (inFlight.size > 0) {
      const report = await Promise.race(inFlight.values());
      inFlight.delete(report.id);
      pushReport(reports, reportByStep, report);
      progressed = true;
    }
    if (!progressed) {
      throw new PipelineError("pipeline_graph_error", "Workflow graph did not make progress", {
        details: { remaining: Array.from(remaining) },
      });
    }
  }

  const orderedReports = orderReports(plan, reports);
  const failedReport = orderedReports.find((report) => report.status === "failed");
  if (failedReport?.error) {
    const failedPlanStep = plan.find((item) => item.step.id === failedReport.id);
    await emit({
      type: "pipeline.failed",
      timestamp: now(),
      status: "failed",
      stepCount: orderedReports.length,
      artifactCount: artifacts.length,
      failedStep: failedPlanStep
        ? stepEvent(failedPlanStep)
        : {
            id: failedReport.id,
            type: failedReport.type,
            dependencies: failedReport.dependencies,
            index: orderedReports.findIndex((report) => report.id === failedReport.id) + 1,
            total: orderedReports.length,
          },
      error: failedReport.error,
    });
    const failedResult: PipelineExecutionReport = {
      status: "failed",
      version: WORKFLOW_VERSION,
      steps: orderedReports,
      artifacts,
    };
    return failedResult;
  }

  await emit({
    type: "pipeline.succeeded",
    timestamp: now(),
    status: "succeeded",
    stepCount: orderedReports.length,
    artifactCount: artifacts.length,
  });
  const successResult: PipelineExecutionReport = {
    status: "succeeded",
    version: WORKFLOW_VERSION,
    steps: orderedReports,
    artifacts,
  };
  return successResult;
}

async function executePlanStep(
  planStep: PipelinePlanStep,
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown>,
  outputs: Map<string, StepResult>,
  artifacts: StepArtifact[],
  emit: (event: PipelineLifecycleEvent) => Promise<void>,
  options: ExecutePipelineOptions,
  blEnv: unknown,
  stepDispatcher: StepDispatcher,
): Promise<PipelineStepReport> {
  const maxAttempts = Math.max(1, Math.floor(planStep.step.retry?.maxAttempts ?? 1));
  let lastError: StructuredStepErrorShape | undefined;
  let lastRedactedInput: Record<string, unknown> | undefined;
  let lastSensitive = false;
  let startedAt = new Date().toISOString();
  let finishedAt = startedAt;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    startedAt = new Date().toISOString();
    await emit({
      type: "step.started",
      timestamp: now(),
      status: "running",
      step: stepEvent(planStep),
      timing: { startedAt },
      attempt,
    });

    try {
      const resolved = resolveStepInput(planStep.step, pipeline, runtimeInput, outputs);
      let resolvedInput = resolved.value;
      let resolvedRedacted = resolved.redacted;

      if (options.basePath) {
        const paths = resolveInputPaths(resolvedInput, options.basePath);
        resolvedInput = paths.input;
        resolvedRedacted = resolveInputPaths(
          resolved.redacted as Record<string, unknown>,
          options.basePath,
        ).input;
        const fileIssues = await checkInputPaths(
          resolvedInput,
          paths.resolvedKeys.filter((k) => !OUTPUT_PATH_KEYS.includes(k)),
          planStep.step.id,
        );
        if (fileIssues.length > 0) {
          throw new PipelineError("pipeline_file_not_found", fileIssues.join("; "), {
            step: planStep.step.type,
            details: { issues: fileIssues },
          });
        }
      }

      lastRedactedInput = resolvedRedacted as Record<string, unknown>;
      lastSensitive = resolved.sensitive;
      await emit({
        type: "step.input.resolved",
        timestamp: now(),
        status: "running",
        step: stepEvent(planStep),
        input: inputSummary(resolvedRedacted as Record<string, unknown>, resolved.sensitiveKeys),
      });

      const output = await executeWithTimeout(
        planStep.step,
        resolvedInput,
        options,
        stepEvent(planStep),
        emit,
        blEnv,
        stepDispatcher,
      );
      outputs.set(planStep.step.id, output);
      const reportOutput = resolved.sensitive ? redactSensitiveOutput(output) : output;
      if (reportOutput.artifacts) artifacts.push(...reportOutput.artifacts);
      finishedAt = new Date().toISOString();

      for (const artifact of reportOutput.artifacts ?? []) {
        await emit({
          type: "artifact.created",
          timestamp: now(),
          status: "running",
          step: stepEvent(planStep),
          artifact,
        });
      }
      await emit({
        type: "step.succeeded",
        timestamp: now(),
        status: "running",
        step: stepEvent(planStep),
        timing: timing(startedAt, finishedAt),
        output: outputSummary(reportOutput),
        attempt,
        ...(reportOutput.warnings && reportOutput.warnings.length > 0
          ? { warnings: reportOutput.warnings }
          : {}),
      });

      return {
        id: planStep.step.id,
        type: planStep.step.type,
        status: "succeeded",
        dependencies: planStep.dependencies,
        input: resolved.redacted,
        output: reportOutput,
        startedAt,
        finishedAt,
        attempts: attempt,
        ...(planStep.step.when !== undefined ? { condition: "true" as const } : {}),
      };
    } catch (err) {
      const pipelineError = toPipelineError(err, planStep.step.type);
      lastError = lastSensitive
        ? redactStructuredError(pipelineError.toJSON())
        : pipelineError.toJSON();
      finishedAt = new Date().toISOString();
      if (attempt < maxAttempts) {
        await emit({
          type: "step.retrying",
          timestamp: now(),
          status: "running",
          step: stepEvent(planStep),
          attempt,
          nextAttempt: attempt + 1,
          error: lastError,
        });
        const delayMs = retryDelayMs(
          planStep.step.retry?.backoff,
          attempt,
          options.retryDelayBaseMs ?? RETRY_BACKOFF_BASE_MS,
        );
        if (delayMs > 0) await (options.sleep ?? sleep)(delayMs);
        continue;
      }
    }
  }

  const error = lastError ?? {
    code: "pipeline_step_failed",
    message: `Step ${planStep.step.id} failed`,
    step: planStep.step.type,
    details: {},
  };
  await emit({
    type: "step.failed",
    timestamp: now(),
    status: "failed",
    step: stepEvent(planStep),
    timing: timing(startedAt, finishedAt),
    attempt: maxAttempts,
    error,
  });
  return {
    id: planStep.step.id,
    type: planStep.step.type,
    status: "failed",
    dependencies: planStep.dependencies,
    ...(lastRedactedInput ? { input: lastRedactedInput } : {}),
    error,
    startedAt,
    finishedAt,
    attempts: maxAttempts,
  };
}

async function executeWithTimeout(
  step: PipelineStep,
  input: Record<string, unknown>,
  options: ExecutePipelineOptions,
  planStepEvent: PipelineEventStep,
  emit: (event: PipelineLifecycleEvent) => Promise<void>,
  blEnv: unknown,
  stepDispatcher: StepDispatcher,
): Promise<StepResult> {
  const timeoutSeconds = parseTimeoutSeconds(step.timeout) ?? options.timeoutSeconds;
  const emitEvent = async (event: Record<string, unknown>) => {
    if (event.type === "step.polling") {
      await emit({
        ...event,
        type: "step.polling",
        timestamp: (event.timestamp as string) ?? now(),
        status: "running",
        step: planStepEvent,
        taskId: event.taskId as string,
        taskStatus: event.taskStatus as string,
        elapsedMs: event.elapsedMs as number,
        pollAttempt: event.pollAttempt as number,
      });
    }
  };

  const ctx: StepContext = {
    dryRun: false,
    signal: options.signal,
    timeoutSeconds,
    blRequestTimeoutSeconds: options.blRequestTimeoutSeconds,
    emitEvent,
    blEnv,
  };

  if (!timeoutSeconds) return await stepDispatcher.executeStep(step.type, input, ctx);

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (options.signal?.aborted) abortFromParent();
  else options.signal?.addEventListener("abort", abortFromParent, { once: true });
  const timeoutMs = timeoutSeconds * 1000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  ctx.signal = controller.signal;

  try {
    return await Promise.race([
      stepDispatcher.executeStep(step.type, input, ctx),
      new Promise<StepResult>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => {
            reject(
              new PipelineError(
                "step_timeout",
                `Step ${step.id} exceeded timeout ${timeoutSeconds}s`,
                { step: step.type },
              ),
            );
          },
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

function pushReport(
  reports: PipelineStepReport[],
  reportByStep: Map<string, PipelineStepReport>,
  report: PipelineStepReport,
): void {
  reports.push(report);
  reportByStep.set(report.id, report);
}

function now(): string {
  return new Date().toISOString();
}

function stepEvent(planStep: PipelinePlanStep): PipelineEventStep {
  return {
    id: planStep.step.id,
    type: planStep.step.type,
    dependencies: planStep.dependencies,
    index: planStep.index,
    total: planStep.total,
  };
}

function inputSummary(
  input: Record<string, unknown>,
  sensitiveKeys: string[] = [],
): PipelineEventInputSummary {
  return {
    keys: Object.keys(input).sort(),
    ...(sensitiveKeys.length > 0 ? { redactedKeys: sensitiveKeys.sort() } : {}),
  };
}

function outputSummary(output: StepResult): PipelineEventOutputSummary {
  return {
    ...(output.data !== undefined ? { dataType: dataType(output.data) } : {}),
    artifactCount: output.artifacts?.length ?? 0,
    warningCount: output.warnings?.length ?? 0,
    ...(output.metadata ? { metadata: output.metadata } : {}),
  };
}

function dataType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function timing(startedAt: string, finishedAt: string): PipelineEventTiming {
  return {
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
  };
}

function retryDelayMs(
  backoff: PipelineRetryPolicy["backoff"] = "none",
  failedAttempt: number,
  baseMs: number,
): number {
  if (backoff === "none") return 0;
  if (backoff === "linear") return baseMs * failedAttempt;
  return baseMs * 2 ** (failedAttempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class AsyncEventQueue<T> {
  private readonly items: T[] = [];
  private readonly takers: Array<(value: T | undefined) => void> = [];
  private readonly pushWaiters: Array<() => void> = [];
  private closed = false;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get size(): number {
    return this.items.length;
  }

  async push(item: T): Promise<void> {
    while (!this.closed && this.items.length >= this.maxSize) {
      await new Promise<void>((resolve) => this.pushWaiters.push(resolve));
    }
    if (this.closed) return;
    const taker = this.takers.shift();
    if (taker) {
      taker(item);
      return;
    }
    this.items.push(item);
  }

  async shift(): Promise<T | undefined> {
    const item = this.items.shift();
    if (item !== undefined) {
      this.wakePushWaiter();
      return item;
    }
    if (this.closed) return undefined;
    return await new Promise<T | undefined>((resolve) => this.takers.push(resolve));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const taker of this.takers.splice(0)) taker(undefined);
    for (const waiter of this.pushWaiters.splice(0)) waiter();
  }

  private wakePushWaiter(): void {
    this.pushWaiters.shift()?.();
  }
}
