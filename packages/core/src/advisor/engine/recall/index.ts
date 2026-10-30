import type { IntentProfile, ModelProfile, RecallStrategy, ScoredCandidate } from "../types.ts";
import {
  applyDisqualification,
  filterWithFallback,
  isAvailable,
  matchesIntentHard,
} from "./hard-filter.ts";
import { applyExcludes, resolveTargetedModels } from "./target-match.ts";

const STRUCTURED_TOP_K = 20;
const HOLISTIC_POOL_MAX = 30;
const TEMPLATE_MIN_POOL = 3;

/** Numeric price of the first price entry, Infinity when unknown. */
function firstPrice(model: ModelProfile): number {
  const raw = model.prices?.[0]?.price;
  const num = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
}

const TIER_ORDER: Record<string, number> = { flagship: 0, balanced: 1, lightweight: 2 };

/** Alibaba-owned providers get priority within the same tier. */
const ALIBABA_PROVIDERS = new Set(["qwen", "qwen-domain-model", "wan"]);

function isAlibaba(model: ModelProfile): boolean {
  return ALIBABA_PROVIDERS.has(model.provider);
}

/**
 * Best-effort generation number from the model id (e.g. "qwen3.8-max" → 3.8,
 * "glm-5.3" → 5.3). Used only as a tie-breaker between same-price models so
 * the newer generation surfaces first. Returns -Infinity when not parseable.
 */
function generationOf(model: ModelProfile): number {
  const match = model.model.match(/(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : Number.NEGATIVE_INFINITY;
}

/**
 * Deterministic ordering: quality preference decides tier direction;
 * within the same tier, Alibaba providers come first, then price descending
 * (higher price ≈ stronger model within the same tier).
 * Exception: cost-optimized budget reverses price to ascending.
 */
function byTierThenPrice(
  intent: IntentProfile,
): (left: ModelProfile, right: ModelProfile) => number {
  const preferCheap = intent.budget === "low" || intent.qualityPreference === "cost-optimized";
  return (left, right) => {
    const tierA = TIER_ORDER[left.profile?.familyTier ?? ""] ?? 1.5;
    const tierB = TIER_ORDER[right.profile?.familyTier ?? ""] ?? 1.5;
    const tierDiff = preferCheap ? tierB - tierA : tierA - tierB;
    if (tierDiff !== 0) return tierDiff;
    // Prefer Alibaba providers within the same tier
    const aliA = isAlibaba(left) ? 0 : 1;
    const aliB = isAlibaba(right) ? 0 : 1;
    if (aliA !== aliB) return aliA - aliB;
    // Price tie-break. Models without a price are treated as weakest and
    // always sort after priced ones (firstPrice returns Infinity for unknown,
    // which would wrongly win a descending sort).
    const priceL = firstPrice(left);
    const priceR = firstPrice(right);
    const unknownL = !Number.isFinite(priceL);
    const unknownR = !Number.isFinite(priceR);
    if (unknownL !== unknownR) return unknownL ? 1 : -1; // unknown last
    if (!unknownL) {
      // price descending = stronger first; cost-optimized reverses to cheapest first
      const priceDiff = preferCheap ? priceL - priceR : priceR - priceL;
      if (priceDiff !== 0) return priceDiff;
    }
    // Same (or unknown) price: newer generation first (qwen3.8-max over qwen3.7-max)
    return generationOf(right) - generationOf(left);
  };
}

function toCandidate(model: ModelProfile, hardScore: number): ScoredCandidate {
  return { model, hardScore, finalScore: hardScore };
}

/**
 * template: scene filter + tier/price sort, computed in real time.
 * Returns null when the scene pool is too small — caller falls back to structured.
 */
export function templateRecall(
  intent: IntentProfile,
  models: ModelProfile[],
): ScoredCandidate[] | null {
  const scene = intent.matchedScenes[0];
  if (!scene) return null;

  const pool = models.filter((model) => model.profile?.scenes?.includes(scene));
  if (pool.length < TEMPLATE_MIN_POOL) return null;

  return pool.sort(byTierThenPrice(intent)).map((model) => toCandidate(model, 1));
}

/** structured: hard gate + fallback, capped to top-K with guaranteed tier diversity. */
export function structuredRecall(intent: IntentProfile, models: ModelProfile[]): ScoredCandidate[] {
  const gated = filterWithFallback(models, intent);
  const scene = intent.matchedScenes[0];

  // Scene-matched candidates first, then tier/price within each group
  const order = byTierThenPrice(intent);
  const sorted = [...gated].sort((left, right) => {
    if (scene) {
      const leftHit = left.profile?.scenes?.includes(scene) ? 0 : 1;
      const rightHit = right.profile?.scenes?.includes(scene) ? 0 : 1;
      if (leftHit !== rightHit) return leftHit - rightHit;
    }
    return order(left, right);
  });

  // Guarantee tier diversity in the top-K pool: a pure tier/price sort lets the
  // dominant tier (usually flagship) fill all K slots, starving downstream
  // tier-aware ranking. Take a per-tier quota first, then fill by global order.
  const byTier = new Map<string, ModelProfile[]>();
  for (const model of sorted) {
    const tier = model.profile?.familyTier ?? "unknown";
    const list = byTier.get(tier) ?? [];
    list.push(model);
    byTier.set(tier, list);
  }

  const picked: ModelProfile[] = [];
  const perTier = Math.ceil(STRUCTURED_TOP_K / Math.max(byTier.size, 1));
  for (const [, group] of byTier) {
    picked.push(...group.slice(0, perTier));
  }
  if (picked.length < STRUCTURED_TOP_K) {
    const pickedIds = new Set(picked.map((model) => model.model));
    for (const model of sorted) {
      if (picked.length >= STRUCTURED_TOP_K) break;
      if (!pickedIds.has(model.model)) picked.push(model);
    }
  }

  return picked.slice(0, STRUCTURED_TOP_K).map((model) => toCandidate(model, 0));
}

/** forced: user-named targets enter unconditionally, remainder filled from gated pool. */
export function forcedRecall(
  intent: IntentProfile,
  models: ModelProfile[],
  topN: number,
): ScoredCandidate[] {
  const targets = intent.modelPreference?.targets ?? [];
  const forced = resolveTargetedModels(models, targets);
  const seen = new Set(forced.map((model) => model.model));
  const results = forced.map((model) => toCandidate(model, 1));

  // comparison mode: only the named models, no fillers
  if (intent.modelPreference?.mode === "comparison") return results;

  const fillCount = Math.max(0, Math.max(topN, 5) - results.length);
  if (fillCount > 0) {
    const pool = filterWithFallback(
      models.filter((model) => !seen.has(model.model)),
      intent,
    );
    for (const model of pool.sort(byTierThenPrice(intent)).slice(0, fillCount)) {
      results.push(toCandidate(model, 0));
    }
  }
  return results;
}

/** holistic-pool: loose modality-only gate, keep <30 for LLM holistic scoring. */
export function holisticPoolRecall(
  intent: IntentProfile,
  models: ModelProfile[],
): ScoredCandidate[] {
  let pool = models.filter((model) => matchesIntentHard(model, intent));
  if (pool.length < 5) pool = models;
  return pool
    .sort(byTierThenPrice(intent))
    .slice(0, HOLISTIC_POOL_MAX)
    .map((model) => toCandidate(model, 0));
}

/** Recall dispatch: availability gate → excludes → strategy → disqualification. */
export function recall(
  strategy: RecallStrategy,
  intent: IntentProfile,
  allModels: ModelProfile[],
  topN: number,
): ScoredCandidate[] {
  let models = allModels.filter(isAvailable);
  models = applyExcludes(models, intent.modelPreference?.excludes ?? []);

  let candidates: ScoredCandidate[];
  switch (strategy) {
    case "template": {
      const templated = templateRecall(intent, models);
      candidates = templated ?? structuredRecall(intent, models);
      break;
    }
    case "forced":
      candidates = forcedRecall(intent, models, topN);
      break;
    case "holistic-pool":
      candidates = holisticPoolRecall(intent, models);
      break;
    case "structured":
    default:
      candidates = structuredRecall(intent, models);
      break;
  }

  // Deterministic negative-list exclusion (skip for user-named targets)
  if (strategy !== "forced") {
    const kept = new Set(
      applyDisqualification(
        candidates.map((candidate) => candidate.model),
        intent,
      ).map((model) => model.model),
    );
    candidates = candidates.filter((candidate) => kept.has(candidate.model.model));
  }

  return candidates;
}
