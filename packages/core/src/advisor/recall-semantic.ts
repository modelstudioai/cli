import type { Client } from "../client/client.ts";
import type { IntentProfile, IntentSegment, ModelPreference, ModelProfile } from "./types.ts";
import { Complexities } from "./types.ts";
import {
  buildAndCacheEmbeddings,
  cosineSimilarity,
  embedQuery,
  loadModelEmbeddings,
  type ModelEmbedding,
} from "./embedding.ts";
import type { ScoredCandidate } from "./recall.ts";

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

function matchesTarget(model: ModelProfile, target: string): boolean {
  const needle = target.toLowerCase();
  return [model.model, model.name, model.family, model.familyName, model.provider].some((field) =>
    field?.toLowerCase().includes(needle),
  );
}

function matchesAnyTarget(model: ModelProfile, targets: string[]): boolean {
  return targets.some((target) => matchesTarget(model, target));
}

function applyExcludes(candidates: ScoredCandidate[], excludes: string[]): ScoredCandidate[] {
  if (excludes.length === 0) return candidates;
  return candidates.filter(({ model }) => !matchesAnyTarget(model, excludes));
}

function matchesSegment(model: ModelProfile, segment: IntentSegment): boolean {
  const modelIn = model.inferenceMetadata?.request_modality ?? [];
  const modelOut = model.inferenceMetadata?.response_modality ?? [];
  const inOk =
    segment.inputModality.length === 0 ||
    segment.inputModality.some((mod) => modelIn.includes(mod));
  const outOk =
    segment.outputModality.length === 0 ||
    segment.outputModality.some((mod) => modelOut.includes(mod));
  if (!inOk || !outOk) return false;
  if (segment.requiredCapabilities.length === 0) return true;
  return segment.requiredCapabilities.some((cap) => model.capabilities.includes(cap));
}

function rankByEmbedding(
  embeddings: ModelEmbedding[],
  queryVector: number[],
  allowedIds: Set<string>,
  topK: number,
): { id: string; similarity: number }[] {
  return embeddings
    .filter((item) => allowedIds.has(item.id))
    .map((item) => ({ id: item.id, similarity: cosineSimilarity(queryVector, item.vector) }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, topK);
}

function recallScoped(
  models: ModelProfile[],
  embeddings: ModelEmbedding[],
  queryVector: number[],
  preference: ModelPreference,
  topK: number,
): ScoredCandidate[] {
  const targets = preference.targets ?? [];
  const scopedModels =
    targets.length > 0 ? models.filter((profile) => matchesAnyTarget(profile, targets)) : models;

  const MIN_SCOPED = 5;
  const pool = scopedModels.length >= MIN_SCOPED ? scopedModels : models;
  const poolIds = new Set(pool.map((profile) => profile.model));
  const scored = rankByEmbedding(embeddings, queryVector, poolIds, topK);

  const modelMap = new Map(models.map((profile) => [profile.model, profile]));
  const results: ScoredCandidate[] = [];

  if (scopedModels.length < MIN_SCOPED && targets.length > 0) {
    for (const profile of scopedModels) {
      results.push({ model: profile, score: 1.0 });
    }
    const seen = new Set(results.map(({ model }) => model.model));
    for (const { id, similarity } of scored) {
      if (seen.has(id)) continue;
      const model = modelMap.get(id);
      if (model) results.push({ model, score: similarity });
      if (results.length >= topK) break;
    }
    return results;
  }

  for (const { id, similarity } of scored) {
    const model = modelMap.get(id);
    if (model) results.push({ model, score: similarity });
  }
  return results;
}

function recallComparison(
  models: ModelProfile[],
  embeddings: ModelEmbedding[],
  queryVector: number[],
  preference: ModelPreference,
  topK: number,
): ScoredCandidate[] {
  const targets = preference.targets ?? [];
  const modelMap = new Map(models.map((profile) => [profile.model, profile]));

  const forced: ScoredCandidate[] = [];
  const forcedIds = new Set<string>();
  for (const profile of models) {
    if (matchesAnyTarget(profile, targets) && !forcedIds.has(profile.model)) {
      forced.push({ model: profile, score: 1.0 });
      forcedIds.add(profile.model);
    }
  }

  const remaining = topK - forced.length;
  if (remaining > 0) {
    const allIds = new Set(
      models.filter((profile) => !forcedIds.has(profile.model)).map((profile) => profile.model),
    );
    const extra = rankByEmbedding(embeddings, queryVector, allIds, remaining);
    for (const { id, similarity } of extra) {
      const model = modelMap.get(id);
      if (model) forced.push({ model, score: similarity });
    }
  }

  return forced;
}

function recallAlternative(
  models: ModelProfile[],
  embeddings: ModelEmbedding[],
  queryVector: number[],
  preference: ModelPreference,
  topK: number,
): ScoredCandidate[] {
  const targets = preference.targets ?? [];
  const modelMap = new Map(models.map((profile) => [profile.model, profile]));

  const refModels = models.filter((profile) => matchesAnyTarget(profile, targets));
  const refFamilies = new Set(refModels.map((profile) => profile.family).filter(Boolean));

  const results: ScoredCandidate[] = [];
  const seen = new Set<string>();

  for (const profile of refModels) {
    results.push({ model: profile, score: 1.0 });
    seen.add(profile.model);
  }

  const altPool = models.filter(
    (profile) => !seen.has(profile.model) && (!profile.family || !refFamilies.has(profile.family)),
  );
  const altIds = new Set(altPool.map((profile) => profile.model));
  const scored = rankByEmbedding(embeddings, queryVector, altIds, topK - results.length);
  for (const { id, similarity } of scored) {
    const model = modelMap.get(id);
    if (model) results.push({ model, score: similarity });
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
  }

  const queryVector = await embedQuery(client, query);
  const modelMap = new Map(models.map((profile) => [profile.model, profile]));
  const preference = intent?.modelPreference;
  const excludes = preference?.excludes ?? [];

  if (preference && preference.mode !== "unconstrained") {
    let results: ScoredCandidate[];
    switch (preference.mode) {
      case "scoped":
        results = recallScoped(models, embeddings, queryVector, preference, topK);
        break;
      case "comparison":
        results = recallComparison(models, embeddings, queryVector, preference, topK);
        break;
      case "alternative":
        results = recallAlternative(models, embeddings, queryVector, preference, topK);
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

      const scored = rankByEmbedding(embeddings, queryVector, allowedIds, perSegment);
      for (const { id, similarity } of scored) {
        const model = modelMap.get(id);
        if (model && !seen.has(id)) {
          results.push({ model, score: similarity });
          seen.add(id);
        }
      }
    }

    return applyExcludes(results, excludes);
  }

  const allIds = new Set(models.map((profile) => profile.model));
  const scored = rankByEmbedding(embeddings, queryVector, allIds, topK);

  const results: ScoredCandidate[] = [];
  for (const { id, similarity } of scored) {
    const model = modelMap.get(id);
    if (model) {
      results.push({ model, score: similarity });
    }
  }

  return applyExcludes(results, excludes);
}
