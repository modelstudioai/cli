import { getDefaultStepDispatcher, type StepDispatcher } from "./dispatcher.ts";
import { registerBlSteps } from "./steps/bl-steps.ts";
import { registerLogicSteps } from "./steps/logic.ts";
import { registerScriptJsStep } from "./steps/script-js.ts";

const initializedDispatchers = new WeakSet<StepDispatcher>();

export function initPipelineSteps(dispatcher = getDefaultStepDispatcher()): StepDispatcher {
  if (initializedDispatchers.has(dispatcher)) return dispatcher;
  initializedDispatchers.add(dispatcher);
  registerBlSteps(dispatcher);
  registerLogicSteps(dispatcher);
  registerScriptJsStep(dispatcher);
  return dispatcher;
}
