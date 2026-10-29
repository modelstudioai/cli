import type {
  ConfidenceLevel,
  IntentProfile,
  Modality,
  ModelProfile,
  RankedCandidate,
  RecommendContext,
  StepRecommendation,
} from "../types.ts";
import { applyDisqualification, isAvailable } from "../recall/hard-filter.ts";
import { applyExcludes } from "../recall/target-match.ts";
import { type PlanStep, normalizeSegments, stepIntent, stepScenes } from "./segments.ts";
import { explainSteps } from "./explain.ts";

export { normalizeSegments } from "./segments.ts";

// ---- Recall: per-step hard gate with progressive relaxation ----

type Gate = StepRecommendation["gate"];

/** Minimum pool size before the gate is relaxed to the next level. */
const MIN_POOL = 2;

function requestModality(model: ModelProfile): Modality[] {
  return model.inferenceMetadata?.request_modality ?? [];
}

function responseModality(model: ModelProfile): Modality[] {
  return model.inferenceMetadata?.response_modality ?? [];
}

/** Unknown model modality never fails a check (upstream omits it for some records). */
function intersectsOrUnknown(modelSide: Modality[], wanted: Modality[]): boolean {
  if (wanted.length === 0 || modelSide.length === 0) return true;
  return wanted.some((mod) => modelSide.includes(mod));
}

function passesGate(model: ModelProfile, step: PlanStep, gate: Gate): boolean {
  if (!model.capabilities.includes(step.primaryCapability)) return false;
  if (gate === "capability-only") return true;
  if (!intersectsOrUnknown(responseModality(model), step.outputModality)) return false;
  if (gate === "relaxed-input") return true;
  return intersectsOrUnknown(requestModality(model), step.inputModality);
}

interface StepPool {
  models: ModelProfile[];
  gate: Gate;
}

/**
 * A step scene whose models should not carry another scene: embedding steps
 * (向量检索) should not pick rerankers, which are also tagged 向量检索.
 */
const EXCLUSIVE_SCENES: Record<string, string> = { 向量检索: "语义重排" };

/** Narrow to a subset only when it still leaves a usable pool. */
function narrow(models: ModelProfile[], keep: (model: ModelProfile) => boolean): ModelProfile[] {
  const subset = models.filter(keep);
  return subset.length >= MIN_POOL ? subset : models;
}

export function recallStep(
  step: PlanStep,
  intent: IntentProfile,
  available: ModelProfile[],
): StepPool {
  const subIntent = stepIntent(step, intent);
  for (const gate of ["strict", "relaxed-input", "capability-only"] as const) {
    let models = available.filter((model) => passesGate(model, step, gate));
    if (models.length < MIN_POOL) continue;
    // step scene: keep models built for this kind of step (e.g. 创意写作 for a script,
    // not translation or long-document models that merely share the TG capability)
    const scene = step.scene;
    if (scene) {
      models = narrow(models, (model) => model.profile?.scenes?.includes(scene) ?? false);
      const conflicting = EXCLUSIVE_SCENES[scene];
      if (conflicting)
        models = narrow(
          models,
          (model) => !(model.profile?.scenes?.includes(conflicting) ?? false),
        );
    }
    // notSuitableFor exclusion, unless it would empty the pool
    models = narrow(models, (model) => applyDisqualification([model], subIntent).length > 0);
    return { models, gate };
  }
  return {
    models: available.filter((model) => passesGate(model, step, "capability-only")),
    gate: "capability-only",
  };
}

// ---- Score: deterministic formula + pipeline role match ----

const STEP_WEIGHTS = { role: 0.35, scene: 0.2, tier: 0.2, price: 0.15, extras: 0.1 };

/**
 * How well the model's declared pipeline roles cover this step's hand-off:
 * exact (input→output) = 1, output only = 0.5, no roles declared = 0.5 (unknown),
 * roles declared but none fit = 0.
 */
/** notSuitableFor wording meaning "needs a reference image/video, not text alone". */
const NEEDS_REFERENCE_RE = /纯文[字本]|无图|仅[用靠]?文字|只有文字|无参考/;

export function roleMatch(model: ModelProfile, step: PlanStep): number {
  // Text-only visual step: models that declare they need a reference input
  // still list Text→X roles (text as guidance), so check their limitations first.
  const textOnlyVisual =
    step.inputModality.length > 0 &&
    step.inputModality.every((mod) => mod === "Text") &&
    step.outputModality.some((mod) => mod === "Image" || mod === "Video");
  if (
    textOnlyVisual &&
    (model.profile?.notSuitableFor ?? []).some((item) => NEEDS_REFERENCE_RE.test(item))
  ) {
    return 0.25;
  }
  const roles = model.profile?.pipelineRole ?? [];
  if (roles.length === 0) return 0.5;
  const fitsOut = (to: Modality) =>
    step.outputModality.length === 0 || step.outputModality.includes(to);
  const fitsIn = (from: Modality) =>
    step.inputModality.length === 0 || step.inputModality.includes(from);
  if (roles.some((role) => fitsIn(role.from) && fitsOut(role.to))) return 1;
  if (roles.some((role) => fitsOut(role.to))) return 0.5;
  return 0;
}

function tierFit(model: ModelProfile, intent: IntentProfile): number {
  const tier = model.profile?.familyTier;
  if (!tier) return 0.7;
  const table: Record<string, Record<string, number>> = {
    flagship: { flagship: 1, balanced: 0.6, lightweight: 0.3 },
    "cost-optimized": { lightweight: 1, balanced: 0.7, flagship: 0.4 },
    balanced: { balanced: 1, flagship: 0.85, lightweight: 0.7 },
  };
  return table[intent.qualityPreference]?.[tier] ?? 0.7;
}

function parsedPrice(model: ModelProfile): { value: number; unit: string } | undefined {
  const entry = model.prices?.[0];
  const value = entry?.price ? Number.parseFloat(entry.price) : Number.NaN;
  return Number.isFinite(value) ? { value, unit: entry!.unit } : undefined;
}

/**
 * Price fit normalized within the step pool, only among models sharing the
 * pool's most common price unit (per second vs per image are not comparable).
 */
function priceFitter(pool: ModelProfile[], intent: IntentProfile): (model: ModelProfile) => number {
  const unitCounts = new Map<string, number>();
  for (const model of pool) {
    const price = parsedPrice(model);
    if (price) unitCounts.set(price.unit, (unitCounts.get(price.unit) ?? 0) + 1);
  }
  const unit = [...unitCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const values = pool
    .map(parsedPrice)
    .filter(
      (price): price is { value: number; unit: string } =>
        price !== undefined && price.unit === unit,
    )
    .map((price) => price.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return (model) => {
    const price = parsedPrice(model);
    if (!price || price.unit !== unit || values.length < 2 || max === min) return 0.5;
    const cheapness = 1 - (price.value - min) / (max - min);
    if (intent.budget === "low") return cheapness;
    if (intent.budget === "high") return 1 - cheapness * 0.5;
    return 0.5 + cheapness * 0.5;
  };
}

/**
 * Coverage of the step's secondary needs: extra capabilities (e.g. Reasoning
 * on a TG step) and required features (function-calling...).
 */
function extrasFit(model: ModelProfile, step: PlanStep, features: string[]): number {
  const extraCaps = step.capabilities.filter((cap) => cap !== step.primaryCapability);
  const total = extraCaps.length + features.length;
  if (total === 0) return 1;
  const hits =
    extraCaps.filter((cap) => model.capabilities.includes(cap)).length +
    features.filter((feature) => model.features.includes(feature)).length;
  return hits / total;
}

interface StepCandidate {
  model: ModelProfile;
  score: number;
  role: number;
}

export function scoreStep(
  pool: ModelProfile[],
  step: PlanStep,
  intent: IntentProfile,
): StepCandidate[] {
  const subIntent = stepIntent(step, intent);
  const scenes = stepScenes(step, intent);
  const priceFit = priceFitter(pool, intent);
  return pool
    .map((model) => {
      const role = roleMatch(model, step);
      const sceneHit =
        scenes.length === 0
          ? 1
          : (model.profile?.scenes ?? []).some((scene) => scenes.includes(scene))
            ? 1
            : 0.3;
      let score =
        STEP_WEIGHTS.role * role +
        STEP_WEIGHTS.scene * sceneHit +
        STEP_WEIGHTS.tier * tierFit(model, intent) +
        STEP_WEIGHTS.price * priceFit(model) +
        STEP_WEIGHTS.extras * extrasFit(model, step, subIntent.requiredFeatures);
      // thin profiles are less trustworthy as a recommendation
      if (model.profile?.profileCompleteness === "structured-only") score *= 0.9;
      return { model, score, role };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (parsedPrice(left.model)?.value ?? Infinity) -
          (parsedPrice(right.model)?.value ?? Infinity),
    );
}

// ---- Select: primary + an alternative that offers a real trade-off ----

/**
 * Alternative = best-scoring candidate from a different quality tier;
 * otherwise from a different family/provider; otherwise simply the runner-up.
 * It must fit the step's hand-off as well as the primary does (e.g. an
 * image+video-only model is no alternative for a text-to-video step).
 */
export function selectPrimaryAndAlternative(ranked: StepCandidate[]): StepCandidate[] {
  const [primary, ...others] = ranked;
  if (!primary) return [];
  const sameFit = others.filter((cand) => cand.role >= primary.role);
  const rest = sameFit.length > 0 ? sameFit : others;
  const tierOf = (cand: StepCandidate) => cand.model.profile?.familyTier ?? "unknown";
  const familyOf = (cand: StepCandidate) => cand.model.family ?? cand.model.provider;
  const alternative =
    rest.find((cand) => tierOf(cand) !== tierOf(primary)) ??
    rest.find((cand) => familyOf(cand) !== familyOf(primary)) ??
    rest[0];
  return alternative ? [primary, alternative] : [primary];
}

// ---- Hand-off validation & confidence ----

const MODALITY_ZH: Record<string, string> = {
  Text: "文本",
  Image: "图片",
  Video: "视频",
  Audio: "音频",
};

/**
 * Check the primary chain: what step i produces must be something step i+1's
 * primary model can take. Steps whose input does not come from the previous
 * step (e.g. voice-over from the script while the video comes from images)
 * are skipped — only an actual modality the next step expects is checked.
 */
export function validateHandoffs(
  steps: PlanStep[],
  primaries: (ModelProfile | undefined)[],
): string[] {
  const warnings: string[] = [];
  for (let idx = 1; idx < steps.length; idx++) {
    const prev = primaries[idx - 1];
    const curr = primaries[idx];
    if (!prev || !curr) continue;
    const produced = responseModality(prev).length
      ? responseModality(prev)
      : steps[idx - 1].outputModality;
    const handed = steps[idx].inputModality.filter((mod) => produced.includes(mod));
    if (handed.length === 0) continue; // this step does not consume the previous step's output
    const accepts = requestModality(curr);
    if (accepts.length > 0 && !handed.some((mod) => accepts.includes(mod))) {
      const what = handed.map((mod) => MODALITY_ZH[mod] ?? mod).join("/");
      warnings.push(
        `第${idx}步 ${prev.name} 输出${what}，但第${idx + 1}步首选 ${curr.name} 不接受${what}输入，衔接时需要转换或换用备选`,
      );
    }
  }
  return warnings;
}

function stepConfidence(pool: StepPool, top: StepCandidate | undefined): ConfidenceLevel {
  if (!top || pool.models.length < MIN_POOL || pool.gate === "capability-only") return "low";
  if (pool.gate === "strict" && pool.models.length >= 3 && top.role === 1) return "high";
  return "medium";
}

const CONFIDENCE_ORDER: ConfidenceLevel[] = ["low", "medium", "high"];

export function weakestConfidence(levels: ConfidenceLevel[]): ConfidenceLevel {
  return levels.reduce<ConfidenceLevel>(
    (weakest, level) =>
      CONFIDENCE_ORDER.indexOf(level) < CONFIDENCE_ORDER.indexOf(weakest) ? level : weakest,
    "high",
  );
}

// ---- Orchestration ----

export interface StepwiseResult {
  steps: StepRecommendation[];
  warnings: string[];
  candidatePool: number;
  confidence: ConfidenceLevel;
}

/**
 * Stepwise engine for multi-step tasks: each intent segment gets its own
 * recall → score → select, then one batched LLM call writes every reason.
 * Deterministic except for the explanation text.
 */
export async function runStepwise(ctx: RecommendContext): Promise<StepwiseResult> {
  const plan = normalizeSegments(ctx.intent.segments);
  const available = applyExcludes(
    ctx.models.filter(isAvailable),
    ctx.intent.modelPreference?.excludes ?? [],
  );

  const tRecall = Date.now();
  const pools = plan.map((step) => recallStep(step, ctx.intent, available));
  ctx.trace.performance.recallMs = Date.now() - tRecall;
  for (let i = 0; i < plan.length; i++) {
    ctx.decisionLog?.push(
      `[step ${i + 1} recall] ${plan[i].label}: pool=${pools[i].models.length} gate=${pools[i].gate} scene=${plan[i].scene ?? "-"}`,
    );
  }

  const tScore = Date.now();
  const ranked = plan.map((step, idx) => scoreStep(pools[idx].models, step, ctx.intent));
  ctx.trace.performance.scoreMs = Date.now() - tScore;
  for (let i = 0; i < plan.length; i++) {
    const top = ranked[i]
      .slice(0, 3)
      .map((c) => `${c.model.model}(${c.score.toFixed(2)},role=${c.role})`)
      .join(", ");
    ctx.decisionLog?.push(`[step ${i + 1} score] ${plan[i].label}: ${top}`);
  }

  const tRank = Date.now();
  const picks = ranked.map((list) => selectPrimaryAndAlternative(list).slice(0, ctx.topN));
  ctx.trace.performance.rankMs = Date.now() - tRank;
  for (let i = 0; i < plan.length; i++) {
    ctx.decisionLog?.push(
      `[step ${i + 1} pick] ${plan[i].label}: ${picks[i].map((c) => c.model.model).join(" + ")}`,
    );
  }

  const rankedSteps = plan.map((step, idx) => ({
    step,
    candidates: picks[idx].map<RankedCandidate>((cand, pos) => ({
      model: cand.model,
      hardScore: cand.score,
      finalScore: cand.score,
      rank: pos + 1,
      slot: pos === 0 ? "primary" : "alternative",
    })),
  }));

  const tExplain = Date.now();
  const explained = await explainSteps(rankedSteps, ctx);
  ctx.trace.performance.explainMs = Date.now() - tExplain;

  const steps: StepRecommendation[] = plan.map((step, idx) => ({
    index: step.index,
    step: step.label,
    inputModality: step.inputModality,
    outputModality: step.outputModality,
    capabilities: step.capabilities,
    recommendations: explained[idx],
    candidatePool: pools[idx].models.length,
    confidence: stepConfidence(pools[idx], ranked[idx][0]),
    gate: pools[idx].gate,
  }));

  return {
    steps,
    warnings: validateHandoffs(
      plan,
      picks.map((list) => list[0]?.model),
    ),
    candidatePool: pools.reduce((sum, pool) => sum + pool.models.length, 0),
    confidence: weakestConfidence(steps.map((step) => step.confidence)),
  };
}
