import { PipelineError } from "./errors.ts";
import type { StepHandler, StepResult, StepContext, StepOutputSchema } from "./types.ts";

export class StepDispatcher {
  private readonly handlers = new Map<string, StepHandler>();
  private readonly outputSchemas = new Map<string, StepOutputSchema>();

  registerStep(id: string, handler: StepHandler, outputSchema?: StepOutputSchema): void {
    this.handlers.set(id, handler);
    if (outputSchema) this.outputSchemas.set(id, outputSchema);
  }

  executeStep(
    id: string,
    input: Record<string, unknown>,
    ctx: StepContext,
  ): Promise<StepResult> | StepResult {
    const handler = this.handlers.get(id);
    if (!handler) {
      throw new PipelineError("unknown_step", `Unknown step type: ${id}`, {
        details: { available: this.listSteps() },
      });
    }
    return handler(input, ctx);
  }

  hasStep(id: string): boolean {
    return this.handlers.has(id);
  }

  listSteps(): string[] {
    return Array.from(this.handlers.keys()).sort();
  }

  getOutputSchema(id: string): StepOutputSchema | undefined {
    return this.outputSchemas.get(id);
  }
}

const defaultDispatcher = new StepDispatcher();

export function createStepDispatcher(): StepDispatcher {
  return new StepDispatcher();
}

export function getDefaultStepDispatcher(): StepDispatcher {
  return defaultDispatcher;
}

export function registerStep(
  id: string,
  handler: StepHandler,
  dispatcher?: StepDispatcher,
  outputSchema?: StepOutputSchema,
): void;
export function registerStep(
  id: string,
  handler: StepHandler,
  outputSchema?: StepOutputSchema,
): void;
export function registerStep(
  id: string,
  handler: StepHandler,
  dispatcherOrSchema?: StepDispatcher | StepOutputSchema,
  outputSchema?: StepOutputSchema,
): void {
  let dispatcher: StepDispatcher;
  let schema: StepOutputSchema | undefined;

  if (dispatcherOrSchema instanceof StepDispatcher) {
    dispatcher = dispatcherOrSchema;
    schema = outputSchema;
  } else {
    dispatcher = defaultDispatcher;
    schema = dispatcherOrSchema ?? outputSchema;
  }

  dispatcher.registerStep(id, handler, schema);
}

export function executeStep(
  id: string,
  input: Record<string, unknown>,
  ctx: StepContext,
  dispatcher = defaultDispatcher,
): Promise<StepResult> | StepResult {
  return dispatcher.executeStep(id, input, ctx);
}

export function hasStep(id: string, dispatcher = defaultDispatcher): boolean {
  return dispatcher.hasStep(id);
}

export function listSteps(dispatcher = defaultDispatcher): string[] {
  return dispatcher.listSteps();
}
