import type { ModelProfile } from "../types.ts";

const SNAPSHOT_DATE_RE = /-\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize an identifier for target matching: lowercase, strip snapshot
 * date suffix, collapse separators so "qwen max" matches "qwen-max".
 */
export function normalizeStr(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(SNAPSHOT_DATE_RE, "")
    .replace(/[\s_-]+/g, "")
    .trim();
}

/**
 * Exact-tier match only: normalized model id / display name / provider-prefix suffix.
 */
function matchesExact(model: ModelProfile, needle: string): boolean {
  if (normalizeStr(model.model) === needle || normalizeStr(model.name) === needle) return true;
  const slashIdx = model.model.lastIndexOf("/");
  if (slashIdx >= 0) {
    if (normalizeStr(model.model.slice(slashIdx + 1)) === needle) return true;
  }
  return false;
}

function matchesFamily(model: ModelProfile, needle: string): boolean {
  return [model.family, model.familyName].some((field) => {
    if (!field) return false;
    const normalized = normalizeStr(field);
    // Bidirectional containment: "exclude qwen3.8" must drop family "qwen3.8-flash",
    // and "recommend deepseek" must expand to family "deepseek-v3".
    return normalized.length > 0 && (needle.includes(normalized) || normalized.includes(needle));
  });
}

/**
 * Per-target progressive resolution: exact match first (model id / name /
 * provider suffix); only when a target has ZERO exact hits does it fall back
 * to family matching. This keeps "deepseek-v3" from dragging in the whole
 * DeepSeek family while "deepseek" (family name) still expands to it.
 */
export function resolveTargetedModels(models: ModelProfile[], targets: string[]): ModelProfile[] {
  if (targets.length === 0) return [];
  const resolved: ModelProfile[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const needle = normalizeStr(target);
    if (!needle) continue;

    let hits = models.filter((model) => matchesExact(model, needle));
    if (hits.length === 0) {
      hits = models.filter((model) => matchesFamily(model, needle));
    }
    for (const model of hits) {
      if (!seen.has(model.model)) {
        seen.add(model.model);
        resolved.push(model);
      }
    }
  }
  return resolved;
}

export function applyExcludes(models: ModelProfile[], excludes: string[]): ModelProfile[] {
  if (excludes.length === 0) return models;
  // Exclusion is intentionally broad: "exclude qwen" should drop the whole family,
  // so family-tier matching applies unconditionally here.
  return models.filter((model) => {
    return !excludes.some((target) => {
      const needle = normalizeStr(target);
      return needle.length > 0 && (matchesExact(model, needle) || matchesFamily(model, needle));
    });
  });
}
