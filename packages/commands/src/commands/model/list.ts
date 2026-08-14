import {
  defineCommand,
  detectOutputFormat,
  fetchModelDetail,
  fetchModelGroups,
  fetchPredictConfig,
  type FlagsDef,
  type ModelGroup,
  type ModelGroupItem,
  type ModelPriceInfo,
  type PredictConfigEntry,
} from "bailian-cli-core";
import { emitResult, emitBare, formatTable } from "bailian-cli-runtime";

const DATE_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/;

const LIST_FLAGS = {
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Show full details of a specific model family (switches to detail mode)",
      "zh-CN": "显示指定模型系列的完整详情（切换到详情模式）",
    },
  },
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Results per page (default: 10)", "zh-CN": "每页结果数（默认：10）" },
  },
  provider: {
    type: "array",
    valueHint: "<p>",
    description: {
      "en-US": "Filter by provider (repeatable, e.g. --provider alibaba --provider deepseek)",
      "zh-CN": "按提供商筛选（可重复，例如 --provider alibaba --provider deepseek）",
    },
  },
  capability: {
    type: "array",
    valueHint: "<c>",
    description: {
      "en-US": "Filter by capability code (TG, Reasoning, VU, IG, VG, TTS, ASR, …)",
      "zh-CN": "按能力代码筛选（TG、Reasoning、VU、IG、VG、TTS、ASR 等）",
    },
  },
  feature: {
    type: "array",
    valueHint: "<f>",
    description: {
      "en-US": "Filter by feature (function-calling, web-search, structured-outputs, …)",
      "zh-CN": "按特性筛选（function-calling、web-search、structured-outputs 等）",
    },
  },
  contextWindow: {
    type: "array",
    valueHint: "<w>",
    description: {
      "en-US": "Filter by context window range bucket",
      "zh-CN": "按上下文窗口范围筛选",
    },
  },
  enrich: {
    type: "switch",
    description: {
      "en-US":
        "Also fetch input parameter schema (predictConfig) for trunk models (detail mode only)",
      "zh-CN": "同时获取主干模型的输入参数 Schema（predictConfig，仅详情模式）",
    },
  },
} satisfies FlagsDef;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip group- prefix from the family model key. */
function familySlug(group: ModelGroup): string {
  return (group.model ?? "").replace(/^group-/, "") || group.name || "unknown";
}

/** Format a single price entry compactly for table display. */
function formatPriceCompact(prices: ModelPriceInfo[] | undefined): string {
  if (!prices?.length) return "-";
  const inputPrice =
    prices.find(
      (priceEntry) => typeof priceEntry.type === "string" && priceEntry.type.includes("input"),
    ) ?? prices[0];
  const typeLabel = inputPrice.type ?? "";
  const priceStr = String(inputPrice.price ?? "?");
  const unit = inputPrice.priceUnit ?? "";
  return `${typeLabel}:${priceStr}/${unit}`;
}

/** Aggregate metadata from a group's items. */
function aggregateGroupMeta(group: ModelGroup) {
  const providers = new Set<string>();
  const capabilities = new Set<string>();
  let modelCount = 0;
  let maxContext = 0;
  let representativePrice: ModelPriceInfo | undefined;
  const allPrices: ModelPriceInfo[] = [];

  for (const item of group.items ?? []) {
    if (item.provider) providers.add(item.provider);
    for (const cap of item.capabilities ?? []) capabilities.add(cap);
    modelCount++;
    if (typeof item.contextWindow === "number" && item.contextWindow > maxContext) {
      maxContext = item.contextWindow;
    }
    if (item.prices?.length) {
      allPrices.push(...item.prices);
      if (!representativePrice) {
        representativePrice =
          item.prices.find(
            (priceEntry) =>
              typeof priceEntry.type === "string" && priceEntry.type.includes("input"),
          ) ?? item.prices[0];
      }
    }
  }

  return {
    providers: [...providers].join(","),
    capabilities: [...capabilities].join(","),
    modelCount,
    maxContext: maxContext > 0 ? maxContext : undefined,
    price: representativePrice ? formatPriceCompact([representativePrice]) : undefined,
    prices: allPrices,
  };
}

/** Pick trunk items: exclude date-suffixed snapshots; if all snapshots, keep the latest. */
function pickTrunkItems(items: ModelGroupItem[]): ModelGroupItem[] {
  if (items.length === 0) return [];
  const trunk = items.filter((item) => !DATE_SUFFIX_RE.test(item.model ?? ""));
  if (trunk.length > 0) return trunk;
  return [...items]
    .sort((first, second) => String(second.model).localeCompare(String(first.model)))
    .slice(0, 1);
}

// ---------------------------------------------------------------------------
// Browse mode — family-level paginated listing
// ---------------------------------------------------------------------------

function printBrowseText(groups: ModelGroup[], total: number): void {
  if (groups.length === 0) {
    emitBare("No model families found.");
    return;
  }

  const headers = ["NAME", "PROVIDER", "CAPABILITIES", "MODELS", "MAX_CONTEXT", "PRICE"];
  const rows = groups.map((group) => {
    const meta = aggregateGroupMeta(group);
    return [
      group.name || familySlug(group),
      meta.providers || "-",
      meta.capabilities || "-",
      String(meta.modelCount),
      meta.maxContext ? String(meta.maxContext) : "-",
      meta.price ?? "-",
    ];
  });

  for (const line of formatTable(headers, rows)) emitBare(line);
  emitBare(`\nTotal: ${total}`);
}

function formatBrowseJson(groups: ModelGroup[], total: number) {
  const items = groups.map((group) => {
    const meta = aggregateGroupMeta(group);
    const firstItem = group.items?.[0];
    return {
      model: familySlug(group),
      name: group.name,
      description: group.description,
      provider: meta.providers,
      capabilities: [...new Set((group.items ?? []).flatMap((item) => item.capabilities ?? []))],
      modelCount: meta.modelCount,
      maxContextWindow: meta.maxContext,
      prices: meta.prices.length > 0 ? meta.prices : undefined,
      qpmInfo: firstItem?.qpmInfo,
    };
  });
  return { items, total };
}

// ---------------------------------------------------------------------------
// Detail mode — single family with full enrichment
// ---------------------------------------------------------------------------

function printDetailText(detail: ModelGroup, includePredictConfig: boolean): void {
  const items = detail.items ?? [];
  const trunkItems = pickTrunkItems(items);
  const snapshotCount = items.length - trunkItems.length;

  emitBare(detail.name ?? detail.model);
  if (detail.description) emitBare(`  ${detail.description}`);
  if (detail.updateAt) emitBare(`  Updated: ${detail.updateAt}`);
  emitBare("");

  // Items table
  const headers = ["MODEL", "PROVIDER", "CAPABILITIES", "CONTEXT", "OUTPUT", "CATEGORY", "PRICE"];
  const rows = items.map((item) => [
    item.model ?? "-",
    item.provider ?? "-",
    (item.capabilities ?? []).join(",") || "-",
    item.contextWindow ? String(item.contextWindow) : "-",
    item.maxOutputTokens ? String(item.maxOutputTokens) : "-",
    item.category ?? "-",
    formatPriceCompact(item.prices),
  ]);

  for (const line of formatTable(headers, rows)) emitBare(line);
  emitBare(
    `\nTotal: ${items.length} models (${trunkItems.length} trunk, ${snapshotCount} snapshots)`,
  );

  // Pricing details per trunk item
  for (const item of trunkItems) {
    if (!item.prices?.length) continue;
    emitBare(`\n── Pricing: ${item.model} ──`);
    const priceHeaders = ["TYPE", "PRICE", "UNIT"];
    const priceRows = item.prices.map((priceEntry) => [
      priceEntry.type ?? "-",
      String(priceEntry.price ?? "-"),
      priceEntry.priceUnit ?? "-",
    ]);
    for (const line of formatTable(priceHeaders, priceRows)) emitBare(line);
  }

  // QPM details per trunk item
  for (const item of trunkItems) {
    if (!item.qpmInfo || Object.keys(item.qpmInfo).length === 0) continue;
    emitBare(`\n── Rate Limits: ${item.model} ──`);
    const qpmHeaders = ["TIER", "RPM", "TPM", "TPM_FIELD"];
    const qpmRows = Object.entries(item.qpmInfo).map(([tier, limits]) => {
      const period = (limits.count_limit_period as number) || 60;
      const rpm = period ? Math.floor((((limits.count_limit as number) || 0) * 60) / period) : 0;
      const usagePeriod = (limits.usage_limit_period as number) || 60;
      const tpm = usagePeriod
        ? Math.floor((((limits.usage_limit as number) || 0) * 60) / usagePeriod)
        : 0;
      return [
        tier,
        rpm > 0 ? String(rpm) : "-",
        tpm > 0 ? String(tpm) : "-",
        (limits.usage_limit_field as string) ?? "-",
      ];
    });
    for (const line of formatTable(qpmHeaders, qpmRows)) emitBare(line);
  }

  // PredictConfig sections
  if (includePredictConfig) {
    for (const item of trunkItems) {
      if (!item.predictConfig || item.predictConfig.length === 0) continue;
      emitBare(`\n── predictConfig: ${item.model} ──`);
      printPredictConfigTable(item.predictConfig);
    }
  }
}

function formatDetailJson(detail: ModelGroup, includePredictConfig: boolean) {
  const items = detail.items ?? [];
  return {
    model: detail.model,
    name: detail.name,
    description: detail.description,
    updateAt: detail.updateAt,
    items: items.map((item) => {
      const entry: Record<string, unknown> = {
        model: item.model,
        name: item.name,
        provider: item.provider,
        capabilities: item.capabilities,
        features: item.features,
        contextWindow: item.contextWindow,
        maxOutputTokens: item.maxOutputTokens,
        maxInputTokens: item.maxInputTokens,
        category: item.category,
        openSource: item.openSource,
        docUrl: item.docUrl,
        versionTag: item.versionTag,
      };
      if (item.prices) entry.prices = item.prices;
      if (item.qpmInfo) entry.qpmInfo = item.qpmInfo;
      if (includePredictConfig && item.predictConfig) {
        entry.predictConfig = item.predictConfig;
      }
      return entry;
    }),
  };
}

function printPredictConfigTable(entries: PredictConfigEntry[]): void {
  const headers = ["PARAM", "KEY", "DEFAULT", "RANGE"];
  const rows = entries.map((entry) => [
    entry.name ?? "-",
    entry.key ?? "-",
    entry.default !== undefined ? JSON.stringify(entry.default) : "-",
    entry.range !== undefined ? JSON.stringify(entry.range) : "-",
  ]);
  for (const line of formatTable(headers, rows)) emitBare(line);
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export default defineCommand({
  description: {
    "en-US": "Browse model families or show detailed model info in the Bailian model marketplace",
    "zh-CN": "浏览百炼模型市场中的模型系列，或查看模型详细信息",
  },
  auth: "console",
  usageArgs:
    "[--model <model>] [--page <n>] [--page-size <n>] [--provider <p>] [--capability <c>] [--feature <f>] [--enrich]",
  flags: LIST_FLAGS,
  exampleArgs: [
    "",
    "--provider alibaba",
    "--capability TG --capability Reasoning",
    "--model qwen-max",
    "--model qwen-max --enrich --output json",
    "--feature function-calling --output json",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";
    const modelKey = flags.model;

    // ── Detail mode ──
    if (modelKey) {
      const shouldEnrich = Boolean(flags.enrich);

      if (settings.dryRun) {
        emitResult({ action: "model.detail", model: modelKey, enrich: shouldEnrich }, format);
        return;
      }

      const detail = await fetchModelDetail(ctx.client.console.bind(ctx.client), modelKey);

      if (!detail) {
        emitBare(`Model "${modelKey}" not found.`);
        return;
      }

      if (shouldEnrich) {
        const trunkItems = pickTrunkItems(detail.items ?? []);
        await Promise.all(
          trunkItems.map(async (item) => {
            if (!item.model) return;
            const config = await fetchPredictConfig(
              ctx.client.console.bind(ctx.client),
              item.model,
            );
            if (config) item.predictConfig = config;
          }),
        );
      }

      if (format === "json") {
        emitResult(formatDetailJson(detail, shouldEnrich), format);
        return;
      }

      printDetailText(detail, shouldEnrich);
      return;
    }

    // ── Browse mode ──
    const params = {
      pageNo: flags.page,
      pageSize: flags.pageSize ?? 10,
      providers: flags.provider?.length ? flags.provider : undefined,
      capabilities: flags.capability?.length ? flags.capability : undefined,
      features: flags.feature?.length ? flags.feature : undefined,
      contextWindows: flags.contextWindow?.length ? flags.contextWindow : undefined,
    };

    if (settings.dryRun) {
      emitResult({ action: "model.list", ...params }, format);
      return;
    }

    const { total, groups } = await fetchModelGroups(ctx.client.console.bind(ctx.client), params);

    if (format === "json") {
      emitResult(formatBrowseJson(groups, total), format);
      return;
    }

    printBrowseText(groups, total);
  },
});
