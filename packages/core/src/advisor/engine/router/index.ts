import type {
  Anchor,
  Cardinality,
  Clarify,
  ExecutionPlan,
  IntentProfile,
  ModelProfile,
  OutputForm,
  UserIntent,
} from "../types.ts";
import { matchesIntentHard } from "../recall/hard-filter.ts";
import { normalizeSegments } from "../steps/segments.ts";

// ---- Ambiguity detection (Step 0, short-circuit) ----

const GENERATION_CAPS = new Set(["IG", "VG", "TTS", "Realtime-Text-to-Speech", "3D-generation"]);
const TEXT_CAPS = new Set(["TG", "Reasoning", "ASR", "Realtime-ASR", "TR", "ME"]);

function hasCrossDomainCaps(caps: string[]): boolean {
  let gen = false;
  let text = false;
  for (const cap of caps) {
    if (GENERATION_CAPS.has(cap)) gen = true;
    if (TEXT_CAPS.has(cap)) text = true;
  }
  return gen && text;
}

/** Hard ambiguity: structural gaps in the intent — O(1) field checks. */
export function detectHardAmbiguity(intent: IntentProfile): Clarify | undefined {
  // user already named models → no ambiguity to resolve
  const mode = intent.modelPreference?.mode;
  if (mode === "comparison" || mode === "alternative") return;

  // output modality known, input direction missing
  if (intent.outputModality.length > 0 && intent.inputModality.length === 0) {
    const out = intent.outputModality[0];
    if (out === "Video" && intent.matchedScenes.length === 0) {
      return {
        question: "你打算从什么素材出发生成视频？",
        options: ["纯文字描述（文生视频）", "已有图片（图生视频）", "已有视频（视频编辑）"],
        defaultIfSkip: "纯文字描述（文生视频）",
        impact: "text-to-video and image-to-video use completely different models",
      };
    }
    if (out === "Audio" && intent.matchedScenes.length === 0) {
      return {
        question: "你需要的是哪类语音能力？",
        options: ["文字转语音（TTS）", "语音转文字（ASR）", "实时语音对话"],
        defaultIfSkip: "文字转语音（TTS）",
        impact: "TTS and ASR are completely different models",
      };
    }
  }

  // multiple cross-domain capabilities without pipeline decomposition
  if (
    intent.complexity !== "pipeline" &&
    intent.requiredCapabilities.length >= 3 &&
    hasCrossDomainCaps(intent.requiredCapabilities)
  ) {
    return {
      question: "你的核心需求是哪一类？",
      options: intent.requiredCapabilities.slice(0, 4),
      defaultIfSkip: intent.requiredCapabilities[0],
      impact: "different capabilities map to completely different model pools",
    };
  }

  return;
}

/** Soft ambiguity: candidate pool scene concentration too low — O(n) stats, no LLM. */
export function detectSoftAmbiguity(
  intent: IntentProfile,
  models: ModelProfile[],
): Clarify | undefined {
  const mode = intent.modelPreference?.mode;
  if (mode === "comparison" || mode === "alternative" || mode === "scoped") return;
  // scene already resolved with confidence → no ambiguity
  if (intent.matchedScenes.length > 0 && intent.sceneConfidence >= 0.5) return;
  if (intent.complexity === "pipeline") return;

  const pool = models.filter((model) => matchesIntentHard(model, intent));

  // Zero-scene request (e.g. "推荐一个"): no signal at all, always clarify.
  // Concentration stats below are unreliable here because models carry multiple
  // scene labels, inflating the top-scene share.
  if (intent.matchedScenes.length === 0 && intent.sceneConfidence < 0.5) {
    const counts = new Map<string, number>();
    for (const model of pool) {
      for (const scene of model.profile?.scenes ?? [])
        counts.set(scene, (counts.get(scene) ?? 0) + 1);
    }
    const topScenes = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([scene]) => scene);
    if (topScenes.length === 0) return;
    return {
      question: "你想用在什么场景？",
      options: topScenes,
      defaultIfSkip: topScenes[0],
      impact: "不同场景对应完全不同的模型池",
    };
  }
  if (pool.length <= 20) return;

  const sceneCounts = new Map<string, number>();
  for (const model of pool) {
    for (const scene of model.profile?.scenes ?? []) {
      sceneCounts.set(scene, (sceneCounts.get(scene) ?? 0) + 1);
    }
  }
  const sorted = [...sceneCounts.entries()].sort((left, right) => right[1] - left[1]);
  if (sorted.length === 0) return;

  const concentration = sorted[0][1] / pool.length;
  if (concentration >= 0.5) return;

  const topScenes = sorted.slice(0, 3).map(([scene]) => scene);
  return {
    question: "你的需求更接近哪个场景？",
    options: topScenes,
    defaultIfSkip: topScenes[0],
    impact: "different scenes produce completely different recommendations",
  };
}

// ---- 4-dimension evaluation ----

export function detectAnchor(intent: IntentProfile): Anchor {
  const pref = intent.modelPreference;
  if (!pref || pref.mode === "unconstrained") return "none";
  if (pref.mode === "comparison") return "existing";
  if (pref.mode === "alternative") return "reference";
  return "scope";
}

export function detectUserIntent(intent: IntentProfile): UserIntent {
  const mode = intent.modelPreference?.mode;
  if (mode === "comparison") {
    // single-target comparison = suitability evaluation
    return (intent.modelPreference?.targets?.length ?? 0) <= 1 ? "evaluate" : "differentiate";
  }
  if (intent.optimizeDimension) return "optimize";
  return "match";
}

export function detectCardinality(intent: IntentProfile): Cardinality {
  return intent.cardinalityHint ?? "few";
}

export function deriveOutput(
  anchor: Anchor,
  userIntent: UserIntent,
  cardinality: Cardinality,
): OutputForm {
  if (userIntent === "differentiate") return "compare";
  if (userIntent === "evaluate") return "validate";
  if (cardinality === "many") return "catalog";
  return "recommend";
}

/** True when the need has fuzzy semantics no structured dimension can capture. */
function isFuzzy(intent: IntentProfile): boolean {
  return intent.matchedScenes.length === 0 && intent.sceneConfidence < 0.5 && intent.confidence > 0;
}

// ---- Declarative routing table ----

/** Evaluated dimensions passed to rule predicates. */
interface RouteContext {
  anchor: Anchor;
  userIntent: UserIntent;
  cardinality: Cardinality;
  output: OutputForm;
  sceneHit: boolean; // matchedScenes.length > 0 && sceneConfidence >= 0.8
  pipeline: boolean; // complexity === "pipeline"
  steps: number; // usable pipeline steps after normalization (0 when < 2)
  fuzzy: boolean; // no scene match + low confidence
}

type PlanBody = Omit<ExecutionPlan, "routingReason">;

interface RoutingRule {
  name: string;
  match: (ctx: RouteContext) => boolean;
  plan: PlanBody;
}

/**
 * Rules are evaluated top-to-bottom; first match wins.
 * Order encodes priority: specific cases before general ones.
 */
const ROUTING_RULES: RoutingRule[] = [
  {
    name: "forced-compare",
    match: (ctx) => ctx.anchor === "existing",
    plan: {
      recall: "forced",
      score: "none",
      rank: "forced-order",
      explain: "llm-compare",
      fairness: false,
      topN: 3,
    },
  },
  {
    name: "forced-alternative",
    match: (ctx) => ctx.anchor === "reference",
    plan: {
      recall: "forced",
      score: "formula",
      rank: "score-sort",
      explain: "llm-compare",
      fairness: false,
      topN: 3,
    },
  },
  {
    // multi-step task with a usable decomposition: per-step recall/score/rank,
    // primary + alternative per step, one batched LLM explanation
    name: "pipeline-steps",
    match: (ctx) => ctx.pipeline && ctx.steps >= 2,
    plan: {
      recall: "structured",
      score: "formula",
      rank: "score-sort",
      explain: "llm-generate",
      fairness: false,
      topN: 2,
      stepwise: true,
    },
  },
  {
    name: "template-fast",
    match: (ctx) => ctx.sceneHit && ctx.userIntent === "match" && !ctx.pipeline,
    plan: {
      recall: "template",
      score: "none",
      rank: "template-order",
      explain: "template-text",
      fairness: true,
      topN: 3,
    },
  },
  {
    // pipeline without a usable step decomposition, or fuzzy semantics
    name: "holistic-complex",
    match: (ctx) => ctx.pipeline || ctx.fuzzy,
    plan: {
      recall: "holistic-pool",
      score: "holistic",
      rank: "score-sort",
      explain: "llm-generate",
      fairness: true,
      topN: 3,
    },
  },
  {
    name: "catalog-browse",
    match: (ctx) => ctx.cardinality === "many",
    plan: {
      recall: "structured",
      score: "formula",
      rank: "score-sort",
      explain: "catalog",
      fairness: true,
      topN: 10,
    },
  },
  {
    name: "optimize-single",
    match: (ctx) => ctx.userIntent === "optimize" && ctx.cardinality === "one",
    plan: {
      recall: "structured",
      score: "formula",
      rank: "score-sort",
      explain: "llm-generate",
      fairness: false,
      topN: 3,
    },
  },
];

/** Always-matches fallback rule. */
const DEFAULT_RULE: RoutingRule = {
  name: "structured-normal",
  match: () => true,
  plan: {
    recall: "structured",
    score: "formula",
    rank: "score-sort",
    explain: "llm-generate",
    fairness: true,
    topN: 3,
  },
};

function clarifyPlan(clarify: Clarify): ExecutionPlan {
  return {
    recall: "structured",
    score: "none",
    rank: "score-sort",
    explain: "llm-generate",
    fairness: false,
    topN: 3,
    routingReason: "ambiguity-detected",
    clarify,
  };
}

/**
 * Router: pure synchronous strategy selector.
 * Step 0: ambiguity short-circuit.
 * Step 1: evaluate 4 dimensions into a RouteContext.
 * Step 2: first-match routing table → ExecutionPlan.
 *
 * @param topNOverride When provided, overrides the per-rule default slate size
 *   (`--top`). Clarification plans carry no slate, so they ignore the override.
 */
export function route(
  intent: IntentProfile,
  models: ModelProfile[],
  topNOverride?: number,
): ExecutionPlan {
  // Step 0: ambiguity short-circuit
  const hardAmb = detectHardAmbiguity(intent);
  if (hardAmb) return clarifyPlan(hardAmb);
  const softAmb = detectSoftAmbiguity(intent, models);
  if (softAmb) return clarifyPlan(softAmb);

  // Step 1: dimension evaluation
  const anchor = detectAnchor(intent);
  const userIntent = detectUserIntent(intent);
  const cardinality = detectCardinality(intent);
  const output = deriveOutput(anchor, userIntent, cardinality);

  const ctx: RouteContext = {
    anchor,
    userIntent,
    cardinality,
    output,
    sceneHit: intent.matchedScenes.length > 0 && intent.sceneConfidence >= 0.8,
    pipeline: intent.complexity === "pipeline",
    steps: intent.complexity === "pipeline" ? normalizeSegments(intent.segments).length : 0,
    fuzzy: isFuzzy(intent),
  };

  // Step 2: first-match wins
  const matched = ROUTING_RULES.find((rule) => rule.match(ctx)) ?? DEFAULT_RULE;

  return {
    ...matched.plan,
    ...(topNOverride !== undefined && topNOverride > 0 ? { topN: topNOverride } : {}),
    routingReason: `${matched.name}|${anchor}/${userIntent}/${cardinality}/${output}`,
  };
}
