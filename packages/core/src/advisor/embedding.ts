import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getConfigDir } from "../config/paths.ts";
import type { Config } from "../config/schema.ts";
import { requestJson } from "../client/http.ts";
import type { ModelProfile } from "./types.ts";

const EMBEDDING_MODEL = "text-embedding-v4";
const DIMENSIONS = 512;
const EMBEDDINGS_FILE = "models-embeddings.json";
const BATCH_SIZE = 10;

export interface ModelEmbedding {
  id: string;
  vector: number[];
}

export interface EmbeddingsData {
  model: string;
  dimensions: number;
  count: number;
  items: ModelEmbedding[];
}

function skillDataDir(): string {
  return join(getConfigDir(), "skills/bailian-docs-llm-wiki");
}

function embeddingsPath(): string {
  return join(skillDataDir(), EMBEDDINGS_FILE);
}

export function loadModelEmbeddings(): ModelEmbedding[] | null {
  const path = embeddingsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as EmbeddingsData;
    return raw.items;
  } catch {
    return null;
  }
}

export async function embedQuery(config: Config, text: string): Promise<number[]> {
  const url = `${config.baseUrl}/compatible-mode/v1/embeddings`;
  const body = {
    model: EMBEDDING_MODEL,
    input: [text],
    dimensions: DIMENSIONS,
    encoding_format: "float",
  };

  const response = await requestJson<{
    data: { index: number; embedding: number[] }[];
  }>(config, { url, method: "POST", body, timeout: 10000 });

  return response.data[0].embedding;
}

async function embedBatch(config: Config, texts: string[]): Promise<number[][]> {
  const url = `${config.baseUrl}/compatible-mode/v1/embeddings`;
  const body = {
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: DIMENSIONS,
    encoding_format: "float",
  };

  const response = await requestJson<{
    data: { index: number; embedding: number[] }[];
  }>(config, { url, method: "POST", body, timeout: 30000 });

  return response.data
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);
}

const CAPABILITY_LABELS: Record<string, string> = {
  TG: "Text Generation",
  Reasoning: "Reasoning",
  VU: "Vision Understanding",
  IG: "Image Generation",
  VG: "Video Generation",
  TTS: "Text-to-Speech",
  ASR: "Speech-to-Text",
};

const MODALITY_LABELS: Record<string, string> = {
  Text: "Text",
  Image: "Image",
  Video: "Video",
  Audio: "Audio",
};

interface GroupData {
  description?: string;
  items?: { model: string; description?: string }[];
}

function loadGroupDescriptions(): Map<string, string> {
  const groupsDir = join(skillDataDir(), "groups");
  const map = new Map<string, string>();
  if (!existsSync(groupsDir)) return map;

  for (const file of readdirSync(groupsDir).filter((name) => name.endsWith(".json"))) {
    try {
      const data = JSON.parse(readFileSync(join(groupsDir, file), "utf-8")) as GroupData;
      const groupDesc = data.description ?? "";
      if (data.items) {
        for (const item of data.items) {
          map.set(item.model, item.description || groupDesc);
        }
      }
    } catch {
      // skip
    }
  }
  return map;
}

function buildModelText(model: ModelProfile, descriptions: Map<string, string>): string {
  const caps = (model.capabilities ?? []).map((cap) => CAPABILITY_LABELS[cap] ?? cap).join(", ");

  const description =
    descriptions.get(model.model) || model.shortDescription || model.description || "";

  const inputMods = (model.inferenceMetadata?.request_modality ?? [])
    .map((mod) => MODALITY_LABELS[mod] ?? mod)
    .join(", ");
  const outputMods = (model.inferenceMetadata?.response_modality ?? [])
    .map((mod) => MODALITY_LABELS[mod] ?? mod)
    .join(", ");

  const parts = [
    model.name,
    model.model,
    description,
    caps ? `Capabilities: ${caps}` : "",
    inputMods ? `Input: ${inputMods}` : "",
    outputMods ? `Output: ${outputMods}` : "",
    model.features?.length ? `Features: ${model.features.join(", ")}` : "",
    model.familyName || "",
    model.category ? `Category: ${model.category}` : "",
  ].filter(Boolean);

  return parts.join(" | ");
}

export async function buildAndCacheEmbeddings(
  config: Config,
  models: ModelProfile[],
): Promise<ModelEmbedding[]> {
  const descriptions = loadGroupDescriptions();
  const texts = models.map((profile) => buildModelText(profile, descriptions));

  const allVectors: number[][] = [];
  for (let batchStart = 0; batchStart < texts.length; batchStart += BATCH_SIZE) {
    const batch = texts.slice(batchStart, batchStart + BATCH_SIZE);
    const vectors = await embedBatch(config, batch);
    allVectors.push(...vectors);
  }

  const items: ModelEmbedding[] = models.map((profile, idx) => ({
    id: profile.model,
    vector: allVectors[idx],
  }));

  const output: EmbeddingsData = {
    model: EMBEDDING_MODEL,
    dimensions: DIMENSIONS,
    count: items.length,
    items,
  };

  const outPath = embeddingsPath();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output));

  return items;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let idx = 0; idx < vecA.length; idx++) {
    dot += vecA[idx] * vecB[idx];
    normA += vecA[idx] * vecA[idx];
    normB += vecB[idx] * vecB[idx];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export { DIMENSIONS, EMBEDDING_MODEL };
