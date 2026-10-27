import type { ModelProfile } from "./types.ts";

/** Human-readable capability/pricing info surfaced alongside each recommendation. */
export interface ModelSpecs {
  /** Formatted price lines, e.g. "输入 12 / 每百万tokens". */
  pricing: string[];
  contextWindow?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  /** Capability features, e.g. function-calling, structured-outputs. */
  features: string[];
}

/** Readable label for a price entry's `type`; falls back to the raw type. */
const PRICE_TYPE_LABEL: Record<string, string> = {
  input_token: "输入",
  output_token: "输出",
  input_token_cache: "缓存输入",
  input_token_cache_creation_5m: "缓存写入",
  input_token_cache_read: "缓存读取",
  input_token_batch: "批量输入",
  output_token_batch: "批量输出",
  input_token_batch_chat: "批量对话输入",
  output_token_batch_chat: "批量对话输出",
};

/** Max price lines to surface so output stays scannable. */
const MAX_PRICE_LINES = 3;

export function buildModelSpecs(model: ModelProfile): ModelSpecs {
  const pricing: string[] = [];
  for (const entry of model.prices ?? []) {
    if (pricing.length >= MAX_PRICE_LINES) break;
    const label = PRICE_TYPE_LABEL[entry.type] ?? entry.type;
    pricing.push(`${label} ${entry.price} / ${entry.unit}`);
  }
  return {
    pricing,
    contextWindow: model.contextWindow,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    features: model.features ?? [],
  };
}

/** Compact one-line summary for text output, e.g. "12/36 每百万tokens · 上下文 1M". */
export function formatSpecsLine(specs: ModelSpecs): string {
  const parts: string[] = [];
  if (specs.pricing.length) parts.push(specs.pricing.join("，"));
  if (specs.contextWindow) parts.push(`上下文 ${formatTokens(specs.contextWindow)}`);
  if (specs.maxOutputTokens) parts.push(`最大输出 ${formatTokens(specs.maxOutputTokens)}`);
  return parts.join(" · ");
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
