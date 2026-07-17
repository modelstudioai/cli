import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../../config/paths.ts";
import type { ModelPrice, ModelProfile, QpmLimit } from "../types.ts";
import type { ModelSource } from "./types.ts";

const SKILL_DIR_NAME = "skills/bailian-docs-llm-wiki";
const MODELS_FILE = "models.jsonl";

function getCatalogDir(): string {
  return join(getConfigDir(), SKILL_DIR_NAME);
}

function getCatalogPath(): string {
  // Full-package layout keeps the `models/` subdir (raw/, wiki/, models/, …),
  // so models.jsonl lives at <skill>/models/models.jsonl — not at the skill root.
  return join(getCatalogDir(), "models", MODELS_FILE);
}

function fromJsonlRecord(raw: Record<string, unknown>): ModelProfile | null {
  if (!raw.model || typeof raw.model !== "string") return null;
  return {
    model: raw.model,
    name: (raw.name as string) ?? raw.model,
    description: (raw.description as string) ?? "",
    provider: (raw.provider as string) ?? "",
    capabilities: (raw.capabilities as string[]) ?? [],
    features: (raw.features as string[]) ?? [],
    contextWindow: raw.contextWindow as number | undefined,
    maxOutputTokens: raw.maxOutputTokens as number | undefined,
    docUrl: raw.docUrl as string | undefined,
    inferenceMetadata: raw.inferenceMetadata as ModelProfile["inferenceMetadata"],
    shortDescription: raw.shortDescription as string | undefined,
    category: raw.category as ModelProfile["category"],
    collectionTag: raw.collectionTag as string | undefined,
    maxInputTokens: raw.maxInputTokens as number | undefined,
    prices: raw.prices as ModelPrice[] | undefined,
    qpmInfo: raw.qpmInfo as Record<string, QpmLimit> | undefined,
    versionTag: raw.versionTag as string | undefined,
    openSource: raw.openSource as boolean | undefined,
    family: raw.family as string | undefined,
    familyName: raw.familyName as string | undefined,
  };
}

function readJsonlModels(filePath: string): ModelProfile[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const models: ModelProfile[] = [];
  for (const line of lines) {
    try {
      const record = fromJsonlRecord(JSON.parse(line));
      if (record) models.push(record);
    } catch {
      // skip malformed lines
    }
  }
  return models;
}

export interface CatalogSourceOptions {
  onPrepareStart?: () => void;
}

export class CatalogSource implements ModelSource {
  readonly name = "catalog";

  // Options retained for API compatibility. Data is now always provisioned by
  // the CLI postinstall hook and refreshed by advisor sync, so the previous
  // `onPrepareStart` install callback is obsolete.
  constructor(_options?: CatalogSourceOptions) {}

  available(): boolean {
    return existsSync(getCatalogPath());
  }

  async load(): Promise<ModelProfile[]> {
    if (!this.available()) return [];
    return readJsonlModels(getCatalogPath());
  }
}
