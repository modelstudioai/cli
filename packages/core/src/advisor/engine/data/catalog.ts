import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../../../config/paths.ts";
import type { FamilyProfile, ModelProfile } from "../types.ts";

/** Directory holding the wiki catalog files (models.jsonl, families.jsonl, groups/). */
function getWikiDataDir(): string {
  return join(getConfigDir(), "skills/bailian-docs-llm-wiki", "models");
}

const SNAPSHOT_DATE_RE = /-\d{4}-\d{2}-\d{2}$/;

let cachedModels: ModelProfile[] | null = null;
let cachedFamilies: Map<string, FamilyProfile> | null = null;

function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const records: T[] = [];
  for (const line of readFileSync(filePath, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as T);
    } catch {
      // skip malformed lines
    }
  }
  return records;
}

/**
 * Drop dated snapshot variants when the base model exists
 * (e.g. keep "qwen-max", drop "qwen-max-2026-01-01").
 */
function deduplicateSnapshots(models: ModelProfile[]): ModelProfile[] {
  const mainModels = new Set(models.map(({ model }) => model));
  return models.filter(({ model }) => {
    const base = model.replace(SNAPSHOT_DATE_RE, "");
    if (base === model) return true;
    return !mainModels.has(base);
  });
}

/** Load models.jsonl (with embedded wiki profile). Process-lifetime cache. */
export async function loadCatalog(dir: string = getWikiDataDir()): Promise<ModelProfile[]> {
  if (cachedModels) return cachedModels;
  const raw = readJsonl<ModelProfile>(join(dir, "models.jsonl"));
  if (raw.length === 0) {
    throw new Error(
      `No model catalog found at ${join(dir, "models.jsonl")}. Run any bl advisor/agent command once to sync wiki data.`,
    );
  }
  cachedModels = deduplicateSnapshots(raw);
  return cachedModels;
}

/** Load families.jsonl on demand (upgrade/compare/explain scenarios). */
export async function loadFamilies(
  dir: string = getWikiDataDir(),
): Promise<Map<string, FamilyProfile>> {
  if (cachedFamilies) return cachedFamilies;
  const raw = readJsonl<FamilyProfile>(join(dir, "families.jsonl"));
  cachedFamilies = new Map(raw.map((fam) => [fam.slug, fam]));
  return cachedFamilies;
}

/** Test hook: reset process-lifetime caches. */
export function resetCatalogCache(): void {
  cachedModels = null;
  cachedFamilies = null;
}
