import type {
  EngineIntentProfile,
  EngineRecommendation,
  EngineRecommendSuccess,
  RecommendedModel,
} from "bailian-cli-core";

/**
 * recommend-adapter.ts — maps engine results onto the advisor-legacy JSON
 * contract so downstream consumers of `bl advisor recommend --output json`
 * see a stable shape:
 *
 * - single → { type: "single", recommendations: RecommendedModel[] }
 * - pipeline (multi-step) → { type: "pipeline", summary, steps: PipelineStep[] }
 * - top-level { intent, result, candidates } preserved
 *
 * Engine-only signals (confidence/slot/routingReason/degradations/specs) never
 * enter stdout JSON; they surface on stderr instead.
 */

/** Adapt an engine Recommendation onto the advisor-legacy RecommendedModel shape. */
function toRecommendedModel(rec: EngineRecommendation): RecommendedModel {
  return {
    model: rec.model,
    name: rec.name,
    reason: rec.reason,
    highlights: rec.highlights,
    contextWindow: rec.specs?.contextWindow,
    maxOutputTokens: rec.specs?.maxOutputTokens,
    docUrl: rec.docUrl,
  };
}

/** Project the engine IntentProfile onto the advisor-legacy intent JSON shape. */
function toLegacyIntent(intent: EngineIntentProfile): Record<string, unknown> {
  return {
    taskSummary: intent.taskSummary,
    scenarioHints: intent.scenarioHints,
    complexity: intent.complexity,
    inputModality: intent.inputModality,
    outputModality: intent.outputModality,
    requiredCapabilities: intent.requiredCapabilities,
    budget: intent.budget,
    qualityPreference: intent.qualityPreference,
    modelPreference:
      intent.modelPreference?.mode !== "unconstrained" ? intent.modelPreference : undefined,
    segments: intent.segments,
  };
}

export interface AdaptedCommandOutput {
  result: { type: "single" | "pipeline"; [key: string]: unknown };
  intent: Record<string, unknown>;
  candidates: number;
}

/** Map an engine success result onto the legacy advisor output payload. */
export function adaptCommandOutput(result: EngineRecommendSuccess): AdaptedCommandOutput {
  let adapted: { type: "single" | "pipeline"; [key: string]: unknown };
  if (result.steps?.length) {
    adapted = {
      type: "pipeline",
      summary: result.steps.map((step) => step.step).join(" → "),
      steps: result.steps.map((step) => ({
        step: step.step,
        recommendations: step.recommendations.map(toRecommendedModel),
      })),
      ...(result.warnings?.length ? { warnings: result.warnings } : {}),
    };
  } else {
    adapted = {
      type: "single",
      recommendations: result.recommendations.map(toRecommendedModel),
    };
  }
  return {
    result: adapted,
    intent: toLegacyIntent(result.intent),
    candidates: result.candidatePool,
  };
}
