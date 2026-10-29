import type {
  Cardinality,
  IntentProfile,
  LLMClient,
  Modality,
  ModelPreference,
  OptimizeDimension,
  PreferenceMode,
} from "../types.ts";
import { INTENT_SYSTEM_PROMPT, SCENE_ENUM } from "./prompts.ts";
import { LLMError, toLLMError } from "../llm/errors.ts";

const VALID_MODES: readonly PreferenceMode[] = [
  "unconstrained",
  "scoped",
  "comparison",
  "alternative",
];
const VALID_MODALITIES = new Set<string>(["Text", "Image", "Video", "Audio"]);
const VALID_SCENES = new Set<string>(SCENE_ENUM);
const VALID_OPTIMIZE = new Set<string>(["price", "speed", "context", "quality"]);
const VALID_CARDINALITY = new Set<string>(["one", "few", "many"]);

export const DEFAULT_INTENT: IntentProfile = {
  complexity: "single",
  taskSummary: "",
  scenarioHints: [],
  inputModality: [],
  outputModality: [],
  requiredCapabilities: ["TG"],
  requiredFeatures: [],
  budget: "medium",
  contextNeed: "standard",
  qualityPreference: "flagship",
  confidence: 0,
  matchedScenes: [],
  sceneConfidence: 0,
};

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function modalityArray(value: unknown): Modality[] {
  return strArray(value).filter((v): v is Modality => VALID_MODALITIES.has(v));
}

function extractModelPreference(raw: unknown): ModelPreference | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const mode: PreferenceMode =
    typeof rec.mode === "string" && VALID_MODES.includes(rec.mode as PreferenceMode)
      ? (rec.mode as PreferenceMode)
      : "unconstrained";
  const targets = strArray(rec.targets);
  const excludes = strArray(rec.excludes);
  return {
    mode,
    targets: targets.length > 0 ? targets : undefined,
    excludes: excludes.length > 0 ? excludes : undefined,
  };
}

/**
 * Analyze user input into a structured IntentProfile via one LLM call.
 * Throws a classified LLMError (stage "intent") on failure. It no longer
 * degrades to DEFAULT_INTENT silently: every downstream stage depends on
 * the intent, and a default intent produced confident-looking but
 * unrelated recommendations (price-only ranking) that hid the real cause.
 */
export async function analyzeIntent(
  llm: LLMClient,
  input: string,
  signal?: AbortSignal,
): Promise<IntentProfile> {
  let parsed: Record<string, unknown>;
  try {
    parsed = await llm.chatJson<Record<string, unknown>>(
      [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
      { stage: "intent", signal },
    );
  } catch (err) {
    throw toLLMError(err, "intent");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LLMError("parse", "Intent response is not a JSON object", { stage: "intent" });
  }

  const matchedScenes = strArray(parsed.matchedScenes).filter((scene) => VALID_SCENES.has(scene));
  const sceneConfidence =
    typeof parsed.sceneConfidence === "number" &&
    parsed.sceneConfidence >= 0 &&
    parsed.sceneConfidence <= 1
      ? parsed.sceneConfidence
      : matchedScenes.length > 0
        ? 0.5
        : 0;

  return {
    complexity: parsed.complexity === "pipeline" ? "pipeline" : "single",
    segments: Array.isArray(parsed.segments)
      ? (parsed.segments as Record<string, unknown>[]).map((seg) => ({
          step: typeof seg.step === "string" ? seg.step : "",
          scene:
            typeof seg.scene === "string" && VALID_SCENES.has(seg.scene) ? seg.scene : undefined,
          inputModality: modalityArray(seg.inputModality),
          outputModality: modalityArray(seg.outputModality),
          requiredCapabilities: strArray(seg.requiredCapabilities),
        }))
      : undefined,
    taskSummary: typeof parsed.taskSummary === "string" ? parsed.taskSummary : "",
    scenarioHints: strArray(parsed.scenarioHints),
    inputModality: modalityArray(parsed.inputModality),
    outputModality: modalityArray(parsed.outputModality),
    requiredCapabilities: strArray(parsed.requiredCapabilities),
    requiredFeatures: strArray(parsed.requiredFeatures),
    budget: parsed.budget === "low" || parsed.budget === "high" ? parsed.budget : "medium",
    contextNeed:
      parsed.contextNeed === "large" || parsed.contextNeed === "extra-large"
        ? parsed.contextNeed
        : "standard",
    qualityPreference:
      parsed.qualityPreference === "cost-optimized" || parsed.qualityPreference === "balanced"
        ? parsed.qualityPreference
        : "flagship",
    confidence: 1,
    modelPreference: extractModelPreference(parsed.modelPreference),
    matchedScenes,
    sceneConfidence,
    cardinalityHint:
      typeof parsed.cardinalityHint === "string" && VALID_CARDINALITY.has(parsed.cardinalityHint)
        ? (parsed.cardinalityHint as Cardinality)
        : undefined,
    optimizeDimension:
      typeof parsed.optimizeDimension === "string" && VALID_OPTIMIZE.has(parsed.optimizeDimension)
        ? (parsed.optimizeDimension as OptimizeDimension)
        : undefined,
  };
}
