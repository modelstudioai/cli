import type { Config } from "../config/schema.ts";
import type { IntentProfile, IntentSegment, ModelProfile } from "./types.ts";
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

export async function recallSemantic(
  config: Config,
  models: ModelProfile[],
  query: string,
  topK: number,
  intent?: IntentProfile,
): Promise<ScoredCandidate[]> {
  let embeddings = getEmbeddings();

  if (!embeddings) {
    embeddings = await buildAndCacheEmbeddings(config, models);
    cachedEmbeddings = embeddings;
  }

  const queryVector = await embedQuery(config, query);
  const modelMap = new Map(models.map((profile) => [profile.model, profile]));

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

    return results;
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

  return results;
}
