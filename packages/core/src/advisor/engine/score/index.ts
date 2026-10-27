import type {
  IntentProfile,
  LLMClient,
  ModelProfile,
  RecommendContext,
  ScoredCandidate,
  ScoreStrategy,
  UserIntent,
} from "../types.ts";
import { extractJson } from "../llm/json.ts";
import { throwIfCancelled, toDegradation, toLLMError } from "../llm/errors.ts";
import { formatIntentContext } from "../intent/context.ts";

// ---- Weight presets by user intent (must each sum to 1) ----

interface Weights {
  scene: number;
  tier: number;
  price: number;
  context: number;
}

const WEIGHT_PRESETS: Record<UserIntent, Weights> = {
  match: { scene: 0.4, tier: 0.2, price: 0.2, context: 0.2 },
  optimize: { scene: 0.1, tier: 0.1, price: 0.6, context: 0.2 },
  evaluate: { scene: 0.5, tier: 0.2, price: 0.1, context: 0.2 },
  differentiate: { scene: 0.3, tier: 0.3, price: 0.2, context: 0.2 },
};

const PURE_DIMENSION_WEIGHTS: Record<string, Weights> = {
  price: { scene: 0, tier: 0, price: 1, context: 0 },
  context: { scene: 0, tier: 0, price: 0, context: 1 },
  quality: { scene: 0.2, tier: 0.8, price: 0, context: 0 },
  speed: { scene: 0.2, tier: 0, price: 0.4, context: 0.4 },
};

export function resolveWeights(userIntent: UserIntent, intent: IntentProfile): Weights {
  if (userIntent === "optimize" && intent.optimizeDimension) {
    return PURE_DIMENSION_WEIGHTS[intent.optimizeDimension] ?? WEIGHT_PRESETS.optimize;
  }
  return WEIGHT_PRESETS[userIntent];
}

// ---- Formula scoring (deterministic, no LLM) ----

const CONTEXT_THRESHOLDS: Record<string, number> = {
  standard: 0,
  large: 32_000,
  "extra-large": 128_000,
};

function firstPrice(model: ModelProfile): number | undefined {
  const raw = model.prices?.[0]?.price;
  const num = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(num) ? num : undefined;
}

function sceneMatchScore(model: ModelProfile, intent: IntentProfile): number {
  if (intent.matchedScenes.length === 0) return 1; // no constraint → no penalty
  const scenes = model.profile?.scenes ?? [];
  return intent.matchedScenes.some((scene) => scenes.includes(scene)) ? 1 : 0;
}

function tierAlignScore(model: ModelProfile, intent: IntentProfile): number {
  const tier = model.profile?.familyTier;
  if (!tier) return 1; // missing = unknown, never penalize
  if (intent.qualityPreference === "flagship") return tier === "flagship" ? 1 : 0.5;
  if (intent.qualityPreference === "cost-optimized") return tier === "lightweight" ? 1 : 0.5;
  return 1; // balanced → neutral
}

function priceFitScore(
  model: ModelProfile,
  intent: IntentProfile,
  pool: ScoredCandidate[],
): number {
  // Normalize within the candidate pool: cheapest = 1, most expensive = 0
  const prices = pool
    .map((candidate) => firstPrice(candidate.model))
    .filter((price): price is number => price !== undefined);
  if (prices.length < 2) return 1;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === min) return 1;

  // Unknown price → assume pool-average rather than best case. Upstream omits
  // prices for some models, and returning 1 let them outrank every priced one.
  const price = firstPrice(model);
  const cheapness = price === undefined ? 0.5 : 1 - (price - min) / (max - min);

  if (intent.budget === "low") return cheapness;
  if (intent.budget === "high") return 1 - cheapness * 0.5; // mild preference for capable (pricier) models
  return 0.5 + cheapness * 0.5; // medium: mild preference for cheaper
}

function contextFitScore(model: ModelProfile, intent: IntentProfile): number {
  const threshold = CONTEXT_THRESHOLDS[intent.contextNeed] ?? 0;
  if (threshold === 0) return 1;
  const cw = model.contextWindow ?? 0;
  if (cw === 0) return 1; // unknown → no penalty
  return cw >= threshold ? 1 : cw / threshold;
}

export function formulaScore(
  candidates: ScoredCandidate[],
  intent: IntentProfile,
  userIntent: UserIntent,
): ScoredCandidate[] {
  const weights = resolveWeights(userIntent, intent);
  return candidates.map((cand) => {
    const score =
      weights.scene * sceneMatchScore(cand.model, intent) +
      weights.tier * tierAlignScore(cand.model, intent) +
      weights.price * priceFitScore(cand.model, intent, candidates) +
      weights.context * contextFitScore(cand.model, intent);
    return { ...cand, hardScore: score, finalScore: score };
  });
}

// ---- Holistic scoring (LLM, for fuzzy needs) ----

const HOLISTIC_SYSTEM_PROMPT = `You are a model-fit judge. For each candidate model, rate how well it fits the user's need on a 1-10 scale, considering the FULL user request and the parsed intent against the model's complete profile (positioning, scenes, style, limitations).

Rules:
- Judge holistically; do not decompose into dimensions
- The parsed intent is the structured reading of the request; use it, but the original request wins if they conflict
- For a pipeline task (Complexity: pipeline), score each model by how well it serves the step that matches its capability; a model that fits no step must score ≤3
- A model whose notSuitableFor conflicts with the need must score ≤3
- Respond with ONLY JSON: {"scores": [{"model": "<id>", "score": <1-10>}]}`;

function candidateBrief(cand: ScoredCandidate): string {
  const profile = cand.model.profile;
  const parts = [
    `ID: ${cand.model.model}`,
    profile?.oneLinePositioning ? `Positioning: ${profile.oneLinePositioning}` : "",
    profile?.scenes?.length ? `Scenes: ${profile.scenes.join(", ")}` : "",
    profile?.styleKeywords?.length ? `Style: ${profile.styleKeywords.join(", ")}` : "",
    profile?.notSuitableFor?.length ? `NotSuitableFor: ${profile.notSuitableFor.join(", ")}` : "",
  ];
  return parts.filter(Boolean).join(" | ");
}

export async function holisticScore(
  candidates: ScoredCandidate[],
  ctx: RecommendContext,
): Promise<ScoredCandidate[]> {
  const llm: LLMClient = ctx.llm;
  const briefs = candidates.map(candidateBrief).join("\n");
  ctx.trace.performance.llmCalls++; // count attempts, including failed ones
  const content = await llm.chat(
    [
      { role: "system", content: HOLISTIC_SYSTEM_PROMPT },
      {
        role: "user",
        content: `User request: ${ctx.input}\n\nParsed intent:\n${formatIntentContext(ctx.intent)}\n\nCandidates:\n${briefs}`,
      },
    ],
    { maxTokens: 2048, stage: "holistic-score", signal: ctx.signal },
  );

  const parsed = extractJson(content) as { scores?: { model: string; score: number }[] };
  const scoreMap = new Map((parsed.scores ?? []).map((entry) => [entry.model, entry.score]));

  return candidates.map((cand) => {
    const raw = scoreMap.get(cand.model.model);
    const holistic = typeof raw === "number" && raw >= 1 && raw <= 10 ? raw : 5;
    return { ...cand, holisticScore: holistic, finalScore: holistic / 10 };
  });
}

// ---- Score dispatch with degradation ----

export async function score(
  strategy: ScoreStrategy,
  candidates: ScoredCandidate[],
  ctx: RecommendContext,
  userIntent: UserIntent,
): Promise<ScoredCandidate[]> {
  switch (strategy) {
    case "none":
      return candidates;
    case "holistic":
      try {
        return await holisticScore(candidates, ctx);
      } catch (err) {
        throwIfCancelled(ctx.signal);
        if (toLLMError(err, "holistic-score").kind === "cancelled") throw err;
        // LLM failure → degrade to deterministic formula, keeping the cause visible
        ctx.trace.degradations.push(
          toDegradation(
            "holistic-score",
            "holistic-score→formula",
            toLLMError(err, "holistic-score"),
          ),
        );
        return formulaScore(candidates, ctx.intent, userIntent);
      }
    case "formula":
    default:
      return formulaScore(candidates, ctx.intent, userIntent);
  }
}
