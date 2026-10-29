export { recommend } from "./pipeline.ts";
export { agentLoop, type AgentResult, type TrajectoryEvent } from "./agent/loop.ts";
export { createLLMClient, DEFAULT_LLM_MODEL, type LLMClientOptions } from "./llm/client.ts";
export { LLMError, formatDegradation, type LLMErrorKind, type LLMStage } from "./llm/errors.ts";
export { loadCatalog, loadFamilies, resetCatalogCache } from "./data/catalog.ts";
export {
  createReadlineInteraction,
  createNonInteractive,
  type Interaction,
} from "./interaction/index.ts";
export {
  RECOMMEND_TOOLS,
  buildEngineInput,
  createSession,
  dispatchTool,
  type Clarification,
  type RecommendSession,
  type ToolDeps,
} from "./tools.ts";
export { route } from "./router/index.ts";
export { analyzeIntent, DEFAULT_INTENT } from "./intent/index.ts";
export type {
  Degradation,
  ExecutionPlan,
  FamilyProfile,
  IntentProfile,
  LLMClient,
  ModelProfile,
  Recommendation,
  RecommendDeps,
  RecommendResult,
  RecommendSuccess,
  RecommendClarify,
} from "./types.ts";
export type {
  Recommendation as EngineRecommendation,
  IntentProfile as EngineIntentProfile,
  RecommendResult as EngineRecommendResult,
  RecommendSuccess as EngineRecommendSuccess,
} from "./types.ts";
export type { StepRecommendation as EngineStepRecommendation } from "./types.ts";
