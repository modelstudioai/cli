import type { Client } from "../client/client.ts";
import type {
  Capability,
  IntentProfile,
  IntentSegment,
  ModelPreference,
  ModelProfile,
  Modality,
} from "./types.ts";
import { Complexities, ModelCategories, QualityPreferences } from "./types.ts";
import {
  buildAndCacheEmbeddings,
  cosineSimilarity,
  embedQuery,
  loadModelEmbeddings,
  type ModelEmbedding,
} from "./embedding.ts";
import type { ScoredCandidate } from "./recall.ts";
import {
  CONTEXT_THRESHOLDS,
  FALLBACK_THRESHOLD,
  FUSION_HARD_WEIGHT,
  FUSION_SOFT_WEIGHT,
  HARD_WEIGHT_CAPABILITY,
  HARD_WEIGHT_CONTEXT,
  HARD_WEIGHT_FEATURE,
  HARD_WEIGHT_QUALITY,
  MIN_CANDIDATES,
  MIN_SIMILARITY,
  SNAPSHOT_DATE_RE,
} from "./constants/scoring.ts";

let cachedEmbeddings: ModelEmbedding[] | null = null;

function getEmbeddings(): ModelEmbedding[] | null {
  if (cachedEmbeddings === null) {
    cachedEmbeddings = loadModelEmbeddings();
  }
  return cachedEmbeddings;
}

export function isSemanticAvailable(): boolean {
  return getEmbeddings() !== null;
}

// ---- target normalization & matching ---------------------------------------

/**
 * Normalize an identifier for target matching: lowercase, strip snapshot date
 * suffix, and collapse spaces/underscores/hyphens so user-written "qwen max"
 * matches catalog id "qwen-max". Returns "" for empty input.
 */
function normalizeStr(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(SNAPSHOT_DATE_RE, "")
    .replace(/[\s_-]+/g, "")
    .trim();
}

function matchesTarget(model: ModelProfile, target: string): boolean {
  const needle = normalizeStr(target);
  if (!needle) return false;
  // exact normalized match on id/name wins (resolves "qwen max" → "qwen-max")
  if (normalizeStr(model.model) === needle || normalizeStr(model.name) === needle) return true;
  // otherwise normalized substring across identifier-ish fields
  return [model.model, model.name, model.family, model.familyName, model.provider].some((field) =>
    field ? normalizeStr(field).includes(needle) : false,
  );
}

function matchesAnyTarget(model: ModelProfile, targets: string[]): boolean {
  return targets.some((target) => matchesTarget(model, target));
}

function resolveTargetedModels(models: ModelProfile[], targets: string[]): ModelProfile[] {
  if (targets.length === 0) return [];
  return models.filter((profile) => matchesAnyTarget(profile, targets));
}

function applyExcludes(candidates: ScoredCandidate[], excludes: string[]): ScoredCandidate[] {
  if (excludes.length === 0) return candidates;
  return candidates.filter(({ model }) => !matchesAnyTarget(model, excludes));
}

// ---- hard track: Tier-1 gate + Tier-2 normalized preference score ----------

/**
 * Shared hard-gate skeleton: a model passes when its input/output modality and
 * capability set each have *some* intersection with the (possibly empty)
 * required sets. Empty required fields are non-constraining. Used by both the
 * intent-level gate (`matchesIntentHard`) and the segment-level gate
 * (`matchesSegment`), which differ only in which constraint bundle they carry.
 */
function matchesModalityCap(
  model: ModelProfile,
  inputModality: Modality[],
  outputModality: Modality[],
  requiredCapabilities: Capability[],
): boolean {
  const modelIn = model.inferenceMetadata?.request_modality ?? [];
  const modelOut = model.inferenceMetadata?.response_modality ?? [];

  if (inputModality.length > 0 && !inputModality.some((mod) => modelIn.includes(mod))) {
    return false;
  }
  if (outputModality.length > 0 && !outputModality.some((mod) => modelOut.includes(mod))) {
    return false;
  }
  if (
    requiredCapabilities.length > 0 &&
    !requiredCapabilities.some((cap) => model.capabilities.includes(cap))
  ) {
    return false;
  }
  return true;
}

/**
 * Hard gate (Tier-1): directional guard — drops models whose capability or
 * modality direction doesn't intersect the intent. Empty intent fields are
 * non-constraining (some-intersection), mirroring matchesSegment semantics.
 */
function matchesIntentHard(model: ModelProfile, intent: IntentProfile): boolean {
  return matchesModalityCap(
    model,
    intent.inputModality,
    intent.outputModality,
    intent.requiredCapabilities,
  );
}

/**
 * Tier-2 preference satisfaction score, normalized to [0,1]. Missing
 * constraints score 1 (no penalty) so models aren't pushed down for absent
 * metadata. Sub-weights: capability coverage (primary) + feature/context/
 * quality-tier alignment.
 */
function hardScore(model: ModelProfile, intent: IntentProfile): number {
  const { requiredCapabilities, requiredFeatures, contextNeed, qualityPreference } = intent;

  let capScore = 1;
  if (requiredCapabilities.length > 0) {
    const matched = requiredCapabilities.filter((cap) => model.capabilities.includes(cap)).length;
    capScore = matched / requiredCapabilities.length;
  }

  let featScore = 1;
  if (requiredFeatures.length > 0) {
    const matched = requiredFeatures.filter((feat) => model.features.includes(feat)).length;
    featScore = matched / requiredFeatures.length;
  }

  let ctxScore = 1;
  const threshold = CONTEXT_THRESHOLDS[contextNeed] ?? 0;
  if (threshold > 0) {
    const cw = model.contextWindow ?? 0;
    ctxScore = cw >= threshold ? 1 : cw / threshold;
  }

  let qualScore = 1;
  if (qualityPreference === QualityPreferences.Flagship) {
    qualScore = model.category === ModelCategories.Flagship ? 1 : 0.5;
  } else if (qualityPreference === QualityPreferences.CostOptimized) {
    qualScore = model.category === ModelCategories.CostOptimized ? 1 : 0.5;
  }
  // Balanced → neutral 1 (no quality-tier pressure)

  return (
    HARD_WEIGHT_CAPABILITY * capScore +
    HARD_WEIGHT_FEATURE * featScore +
    HARD_WEIGHT_CONTEXT * ctxScore +
    HARD_WEIGHT_QUALITY * qualScore
  );
}

/**
 * Apply the hard gate to `pool`, falling back to the unfiltered `pool`
 * itself when the gate leaves too few (< FALLBACK_THRESHOLD) — so recall
 * never collapses. The fallback stays within `pool`, preserving any
 * scoping/exclusion constraint the caller already applied.
 */
function filterWithFallback(pool: ModelProfile[], intent?: IntentProfile): Set<string> {
  if (!intent) return new Set(pool.map((profile) => profile.model));
  const filtered = pool.filter((profile) => matchesIntentHard(profile, intent));
  const usePool = filtered.length >= FALLBACK_THRESHOLD ? filtered : pool;
  return new Set(usePool.map((profile) => profile.model));
}

function matchesSegment(model: ModelProfile, segment: IntentSegment): boolean {
  return matchesModalityCap(
    model,
    segment.inputModality,
    segment.outputModality,
    segment.requiredCapabilities,
  );
}

// ---- dual-track fusion ranking ---------------------------------------------

/**
 * Rank candidates within `allowedIds` by fused score:
 *   combined = FUSION_HARD_WEIGHT · hardScore + FUSION_SOFT_WEIGHT · softScore
 * where softScore = cosine(queryVector, modelVector). A soft-score floor
 * (MIN_SIMILARITY) drops low-relevance hits; if that leaves fewer than
 * MIN_CANDIDATES the floor is relaxed to preserve recall.
 *
 * Returns ScoredCandidate[] with score=combined plus hardScore/softScore for
 * explainability. Without intent, degrades to pure-soft ranking.
 */
function rankByFusion(
  embeddings: ModelEmbedding[],
  queryVector: number[],
  allowedIds: Set<string>,
  topK: number,
  modelMap: Map<string, ModelProfile>,
  intent?: IntentProfile,
): ScoredCandidate[] {
  const scored = embeddings
    .filter((item) => allowedIds.has(item.id))
    .flatMap((item): ScoredCandidate[] => {
      const model = modelMap.get(item.id);
      if (!model) return [];
      const softScore = cosineSimilarity(queryVector, item.vector);
      const hScore = intent ? hardScore(model, intent) : 0;
      const combined = intent
        ? FUSION_HARD_WEIGHT * hScore + FUSION_SOFT_WEIGHT * softScore
        : softScore;
      return [
        {
          model,
          score: combined,
          hardScore: intent ? hScore : undefined,
          softScore,
        },
      ];
    });

  // soft-score floor with fallback so recall never collapses for cold queries
  const filtered = scored.filter((cand) => (cand.softScore ?? 0) >= MIN_SIMILARITY);
  const chosen = filtered.length >= MIN_CANDIDATES ? filtered : scored;

  return chosen.sort((left, right) => right.score - left.score).slice(0, Math.max(0, topK));
}

/** Forced (user-named) candidate — priority 1.0 across all tracks. */
function forcedCandidate(model: ModelProfile): ScoredCandidate {
  return { model, score: 1.0, hardScore: 1, softScore: 1 };
}

function recallScoped(
  models: ModelProfile[],
  embeddings: ModelEmbedding[],
  queryVector: number[],
  preference: ModelPreference,
  topK: number,
  modelMap: Map<string, ModelProfile>,
  intent?: IntentProfile,
): ScoredCandidate[] {
  const targets = preference.targets ?? [];
  const scopedModels = targets.length > 0 ? resolveTargetedModels(models, targets) : models;

  const MIN_SCOPED = 5;
  const results: ScoredCandidate[] = [];

  if (scopedModels.length < MIN_SCOPED && targets.length > 0) {
    // too few scoped hits: force them in (bypass hard gate), then fill from
    // the hard-gated full pool via fusion.
    for (const profile of scopedModels) {
      results.push(forcedCandidate(profile));
    }
    const seen = new Set(results.map(({ model }) => model.model));
    const poolIds = filterWithFallback(models, intent);
    const scored = rankByFusion(embeddings, queryVector, poolIds, topK, modelMap, intent);
    for (const cand of scored) {
      if (seen.has(cand.model.model)) continue;
      results.push(cand);
      if (results.length >= topK) break;
    }
    return results;
  }

  // enough scoped hits: fusion-rank within the hard-gated scoped pool
  const poolIds = filterWithFallback(scopedModels, intent);
  return rankByFusion(embeddings, queryVector, poolIds, topK, modelMap, intent);
}

function recallComparison(
  models: ModelProfile[],
  embeddings: ModelEmbedding[],
  queryVector: number[],
  preference: ModelPreference,
  topK: number,
  modelMap: Map<string, ModelProfile>,
  intent?: IntentProfile,
): ScoredCandidate[] {
  const targets = preference.targets ?? [];

  // user-named models are forced in (bypass hard gate), priority 1.0
  const forced: ScoredCandidate[] = [];
  const forcedIds = new Set<string>();
  for (const profile of models) {
    if (matchesAnyTarget(profile, targets) && !forcedIds.has(profile.model)) {
      forced.push(forcedCandidate(profile));
      forcedIds.add(profile.model);
    }
  }

  const remaining = Math.max(0, topK - forced.length);
  if (remaining > 0) {
    const candidatePool = models.filter((profile) => !forcedIds.has(profile.model));
    const poolIds = filterWithFallback(candidatePool, intent);
    const extra = rankByFusion(embeddings, queryVector, poolIds, remaining, modelMap, intent);
    for (const cand of extra) {
      forced.push(cand);
    }
  }

  // clamp in case many targets matched beyond topK (forced are first, so they
  // are preserved up to topK and extras drop first)
  return forced.slice(0, Math.max(0, topK));
}

function recallAlternative(
  models: ModelProfile[],
  embeddings: ModelEmbedding[],
  queryVector: number[],
  preference: ModelPreference,
  topK: number,
  modelMap: Map<string, ModelProfile>,
  intent?: IntentProfile,
): ScoredCandidate[] {
  const targets = preference.targets ?? [];

  const refModels = resolveTargetedModels(models, targets);
  const refFamilies = new Set(refModels.map((profile) => profile.family).filter(Boolean));

  const results: ScoredCandidate[] = [];
  const seen = new Set<string>();

  // reference models forced in (bypass hard gate)
  for (const profile of refModels) {
    results.push(forcedCandidate(profile));
    seen.add(profile.model);
  }

  const remaining = Math.max(0, topK - results.length);
  if (remaining > 0) {
    const altPool = models.filter(
      (profile) =>
        !seen.has(profile.model) && (!profile.family || !refFamilies.has(profile.family)),
    );
    const poolIds = filterWithFallback(altPool, intent);
    const scored = rankByFusion(embeddings, queryVector, poolIds, remaining, modelMap, intent);
    for (const cand of scored) {
      results.push(cand);
    }
  }

  return results;
}

export async function recallSemantic(
  client: Client,
  models: ModelProfile[],
  query: string,
  topK: number,
  intent?: IntentProfile,
): Promise<ScoredCandidate[]> {
  let embeddings = getEmbeddings();

  if (!embeddings) {
    embeddings = await buildAndCacheEmbeddings(client, models);
    cachedEmbeddings = embeddings;
  } else {
    // id-coverage check: rebuild when the model set has drifted since the
    // embeddings were built (models added OR removed). A one-sided "added"
    // check would leave stale vectors for removed models in the cache, letting
    // a since-delisted model ride into the candidate pool. Symmetric diff
    // catches both directions.
    const embIds = new Set(embeddings.map((item) => item.id));
    const modelIds = new Set(models.map((profile) => profile.model));
    let drifted = embIds.size !== modelIds.size;
    if (!drifted) {
      for (const id of embIds) {
        if (!modelIds.has(id)) {
          drifted = true;
          break;
        }
      }
    }
    if (drifted) {
      embeddings = await buildAndCacheEmbeddings(client, models);
      cachedEmbeddings = embeddings;
    }
  }

  // soft track uses the LLM-refined semantic query when available, falling back
  // to the raw user query so the soft track never depends on intent LLM quality
  const semanticQuery = intent?.semanticQuery?.trim() || query;
  const queryVector = await embedQuery(client, semanticQuery);
  const modelMap = new Map(models.map((profile) => [profile.model, profile]));
  const preference = intent?.modelPreference;
  const excludes = preference?.excludes ?? [];

  if (preference && preference.mode !== "unconstrained") {
    let results: ScoredCandidate[];
    switch (preference.mode) {
      case "scoped":
        results = recallScoped(models, embeddings, queryVector, preference, topK, modelMap, intent);
        break;
      case "comparison":
        results = recallComparison(
          models,
          embeddings,
          queryVector,
          preference,
          topK,
          modelMap,
          intent,
        );
        break;
      case "alternative":
        results = recallAlternative(
          models,
          embeddings,
          queryVector,
          preference,
          topK,
          modelMap,
          intent,
        );
        break;
      default:
        results = [];
    }
    return applyExcludes(results, excludes);
  }

  if (intent?.complexity === Complexities.Pipeline && intent.segments?.length) {
    const seen = new Set<string>();
    const results: ScoredCandidate[] = [];
    const perSegment = Math.max(5, Math.ceil(topK / intent.segments.length));

    for (const segment of intent.segments) {
      const matched = models.filter((profile) => matchesSegment(profile, segment));
      const allowedIds = new Set(
        matched.filter((profile) => !seen.has(profile.model)).map((profile) => profile.model),
      );
      if (allowedIds.size === 0) continue;

      const scored = rankByFusion(
        embeddings,
        queryVector,
        allowedIds,
        perSegment,
        modelMap,
        intent,
      );
      for (const cand of scored) {
        if (!seen.has(cand.model.model)) {
          results.push(cand);
          seen.add(cand.model.model);
        }
      }
    }

    return applyExcludes(results, excludes);
  }

  // unconstrained: hard-gate the full pool (with fallback), then fusion-rank
  const poolIds = filterWithFallback(models, intent);
  const results = rankByFusion(embeddings, queryVector, poolIds, topK, modelMap, intent);

  return applyExcludes(results, excludes);
}
