import {
  anonymousConsoleCall,
  defineCommand,
  detectOutputFormat,
  fetchModelGroupsAll,
  type ModelGroupItem,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import {
  MODEL_FILTER_FLAGS,
  filterModelsLocally,
  formatOfflineMarker,
  formatPriceCompact,
  isSnapshotModel,
  itemModalities,
  modelFilterParams,
  modelLifecycle,
  normalizeModelKey,
} from "./shared.ts";

const DEFAULT_LIMIT = 20;

/**
 * Field weights for keyword relevance. Ordered so that a hit on the model id
 * always outranks a hit on prose, and prose alone can never outrank an id hit.
 */
const MATCH_WEIGHTS = {
  modelExact: 100,
  modelPrefix: 60,
  modelContains: 40,
  nameContains: 30,
  capability: 20,
  feature: 15,
  provider: 12,
  description: 8,
} as const;

/** Tie-breakers applied only to models that already matched. */
const RANK_BOOSTS = {
  recommended: 10,
  flagship: 6,
  trunk: 5,
} as const;

/**
 * Within-tier spread. Two models can both prefix-match (`qwen-max` and
 * `qwen-vl-ocr-1028` for "qwen"); the one the query explains more of wins.
 */
const COVERAGE_SPAN = 30;

/**
 * Lifecycle sinking. A model with a published retirement date is still callable
 * but must not outrank a healthy one; an offline one sinks to the bottom.
 */
const RANK_PENALTIES = {
  announcedRetirement: 25,
  offline: 60,
} as const;

function coverage(keyword: string, candidate: string): number {
  return candidate.length > 0 ? keyword.length / candidate.length : 0;
}

/**
 * Relevance of `rawKeyword` to a model, or 0 when nothing matched. Ids, names,
 * capabilities, features and providers compare on normalized keys (so
 * "web search" matches `web-search`); descriptions compare on raw lowercased
 * text because they carry prose and CJK that normalization would destroy.
 */
export function scoreModelMatch(item: ModelGroupItem, rawKeyword: string): number {
  const keyword = normalizeModelKey(rawKeyword);
  const freeText = rawKeyword.trim().toLowerCase();
  if (!keyword && !freeText) return 0;

  const modelKey = normalizeModelKey(item.model ?? "");
  const nameKey = normalizeModelKey(item.name ?? "");

  let score = 0;

  if (keyword) {
    // Id and name are alternative tiers, not additive: a model whose display
    // name merely restates its id must not lose out to one that diverges.
    if (modelKey === keyword) {
      score += MATCH_WEIGHTS.modelExact;
    } else if (modelKey.startsWith(keyword)) {
      score += MATCH_WEIGHTS.modelPrefix + coverage(keyword, modelKey) * COVERAGE_SPAN;
    } else if (modelKey.includes(keyword)) {
      score += MATCH_WEIGHTS.modelContains + coverage(keyword, modelKey) * COVERAGE_SPAN;
    } else if (nameKey.includes(keyword)) {
      score += MATCH_WEIGHTS.nameContains + coverage(keyword, nameKey) * COVERAGE_SPAN;
    }

    if (
      (item.capabilities ?? []).some((capability) =>
        normalizeModelKey(capability).includes(keyword),
      )
    ) {
      score += MATCH_WEIGHTS.capability;
    }
    if ((item.features ?? []).some((feature) => normalizeModelKey(feature).includes(keyword))) {
      score += MATCH_WEIGHTS.feature;
    }
    if (normalizeModelKey(item.provider ?? "").includes(keyword)) {
      score += MATCH_WEIGHTS.provider;
    }
  }

  if (freeText) {
    const description = `${item.description ?? ""} ${item.shortDescription ?? ""}`.toLowerCase();
    if (description.includes(freeText)) score += MATCH_WEIGHTS.description;
  }

  if (score === 0) return 0;

  if (item.aliyunRecommend === true) score += RANK_BOOSTS.recommended;
  if (item.category === "Flagship") score += RANK_BOOSTS.flagship;
  if (!isSnapshotModel(item.model)) score += RANK_BOOSTS.trunk;

  const lifecycle = modelLifecycle(item);
  if (lifecycle.offline) score -= RANK_PENALTIES.offline;
  else if (lifecycle.upcomingOfflineAt) score -= RANK_PENALTIES.announcedRetirement;

  return Math.round(score * 10) / 10;
}

interface RankedModel {
  item: ModelGroupItem;
  score: number;
}

function printSearchText(ranked: RankedModel[], keyword: string, hiddenOffline: number): void {
  if (ranked.length === 0) {
    emitBare(`No models matched "${keyword}".`);
    return;
  }

  const showStatus = ranked.some(({ item }) => formatOfflineMarker(modelLifecycle(item)) !== "");
  const headers = ["MODEL", "PROVIDER", "CAPABILITIES", "CONTEXT", "PRICE"];
  if (showStatus) headers.push("STATUS");

  const rows = ranked.map(({ item }) => {
    const row = [
      item.model ?? "-",
      item.provider ?? "-",
      (item.capabilities ?? []).join(",") || "-",
      item.contextWindow ? String(item.contextWindow) : "-",
      formatPriceCompact(item.prices),
    ];
    if (showStatus) row.push(formatOfflineMarker(modelLifecycle(item)) || "-");
    return row;
  });

  for (const line of formatTable(headers, rows)) emitBare(line);
  emitBare(`\nMatches: ${ranked.length}`);
  if (hiddenOffline > 0) {
    emitBare(`${hiddenOffline} offline models hidden — use --include-deprecated to include them.`);
  }
}

function formatSearchJson(ranked: RankedModel[], keyword: string, hiddenOffline: number) {
  return {
    keyword,
    total: ranked.length,
    hiddenOffline: hiddenOffline > 0 ? hiddenOffline : undefined,
    items: ranked.map(({ item, score }) => {
      const lifecycle = modelLifecycle(item);
      return {
        model: item.model,
        name: item.name,
        provider: item.provider,
        capabilities: item.capabilities,
        features: item.features,
        category: item.category,
        contextWindow: item.contextWindow,
        maxOutputTokens: item.maxOutputTokens,
        docUrl: item.docUrl,
        modalities: itemModalities(item),
        prices: item.prices,
        score,
        offline: lifecycle.offline || undefined,
        upcomingOfflineAt: lifecycle.upcomingOfflineAt,
        announceUrl: lifecycle.announceUrl,
      };
    }),
  };
}

export default defineCommand({
  description: {
    "en-US": "Search the model catalog by keyword, ranked by relevance",
    "zh-CN": "按关键词搜索模型目录，并按相关度排序",
  },
  auth: "none",
  usageArgs: "--keyword <kw> [--limit <n>] [--input-modality <m>] [--output-modality <m>] [flags]",
  flags: {
    keyword: {
      type: "string",
      valueHint: "<kw>",
      required: true,
      description: {
        "en-US": "Keyword matched against model id, name, capabilities, features and description",
        "zh-CN": "关键词，匹配模型 ID、名称、能力、特性与描述",
      },
    },
    limit: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Maximum results to return (default: 20)",
        "zh-CN": "最多返回的结果数（默认：20）",
      },
    },
    ...MODEL_FILTER_FLAGS,
  },
  exampleArgs: [
    "--keyword qwen",
    "--keyword vision --output-modality Text",
    "--keyword function-calling --provider alibaba",
    "--keyword 长上下文 --limit 5",
    "--keyword qwen --include-deprecated --output json",
  ],
  notes: [
    {
      "en-US":
        "Search scans the whole catalog so that ranking sees every candidate; models already offline are hidden unless --include-deprecated is set.",
      "zh-CN":
        "搜索会扫描完整目录以保证排序看到全部候选；已下线的模型默认隐藏，除非指定 --include-deprecated。",
    },
    {
      "en-US": "The model catalog endpoint is public — no console login needed.",
      "zh-CN": "模型目录为公开接口，无需登录控制台。",
    },
  ],
  validate: (flags) => {
    if (flags.limit != null && flags.limit < 1) {
      return "--limit must be a positive number.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";
    const limit = flags.limit ?? DEFAULT_LIMIT;
    const params = modelFilterParams(flags);
    const call = anonymousConsoleCall(settings);

    if (settings.dryRun) {
      emitResult(
        {
          action: "model.search",
          keyword: flags.keyword,
          limit,
          includeDeprecated: Boolean(flags.includeDeprecated),
          ...params,
        },
        format,
      );
      return;
    }

    const catalog = await fetchModelGroupsAll(call, params);
    const visible = filterModelsLocally(catalog, flags);
    const hiddenOffline = flags.includeDeprecated
      ? 0
      : catalog.filter((item) => modelLifecycle(item).offline).length;

    const ranked = visible
      .map((item) => ({ item, score: scoreModelMatch(item, flags.keyword) }))
      .filter((entry) => entry.score > 0)
      .sort(
        (first, second) =>
          second.score - first.score ||
          String(first.item.model).localeCompare(String(second.item.model)),
      )
      .slice(0, limit);

    if (format === "json") {
      emitResult(formatSearchJson(ranked, flags.keyword, hiddenOffline), format);
      return;
    }

    printSearchText(ranked, flags.keyword, hiddenOffline);
  },
});
