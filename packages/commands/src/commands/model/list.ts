import {
  anonymousConsoleCall,
  defineCommand,
  fetchModelDetail,
  fetchModelGroups,
  fetchPredictConfig,
  type FlagsDef,
  type LocalizedText,
  type ModelGroup,
  type ModelPriceInfo,
  type PredictConfigEntry,
} from "bailian-cli-core";
import { formatTable } from "bailian-cli-runtime";
import {
  MODEL_FILTER_FLAGS,
  filterModelsLocally,
  formatOfflineMarker,
  formatPriceCompact,
  itemModalities,
  matchesModality,
  modelFilterParams,
  modelLifecycle,
  pickTrunkItems,
} from "./shared.ts";

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
    description: {
      "en-US": "Page number (default: 1)",
      "zh-CN": "页码（默认：1）",
    },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Results per page (default: 10)",
      "zh-CN": "每页结果数（默认：10）",
    },
  },
  ...MODEL_FILTER_FLAGS,
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

// ---------------------------------------------------------------------------
// Browse mode — family-level paginated listing
// ---------------------------------------------------------------------------

interface BrowseFooter {
  /** Catalog total for the server-side filters. */
  total: number;
  /** Models dropped from this page by the offline filter. */
  hiddenOffline: number;
  /** Models dropped from this page by the modality filter. */
  hiddenModality: number;
}

function browseText(
  groups: ModelGroup[],
  footer: BrowseFooter,
  localize: (text: LocalizedText) => string,
): string {
  const lines: string[] = [];
  if (groups.length === 0) {
    lines.push(localize({ "en-US": "No model families found.", "zh-CN": "未找到模型系列。" }));
    return lines.join("\n");
  }

  const headers = [
    localize({ "en-US": "NAME", "zh-CN": "名称" }),
    localize({ "en-US": "PROVIDER", "zh-CN": "提供商" }),
    localize({ "en-US": "CAPABILITIES", "zh-CN": "能力" }),
    localize({ "en-US": "MODELS", "zh-CN": "模型数" }),
    localize({ "en-US": "MAX_CONTEXT", "zh-CN": "最大上下文" }),
    localize({ "en-US": "PRICE", "zh-CN": "价格" }),
  ];
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

  for (const line of formatTable(headers, rows)) lines.push(line);
  lines.push(localize({ "en-US": `\nTotal: ${footer.total}`, "zh-CN": `\n总计: ${footer.total}` }));
  // Modality filtering is per page, so the catalog total above predates it.
  if (footer.hiddenModality > 0) {
    lines.push(
      localize({
        "en-US": `${footer.hiddenModality} models on this page excluded by the modality filter (not reflected in Total).`,
        "zh-CN": `本页有 ${footer.hiddenModality} 个模型被模态条件过滤（总数未扣除）。`,
      }),
    );
  }
  if (footer.hiddenOffline > 0) {
    lines.push(
      localize({
        "en-US": `${footer.hiddenOffline} offline models hidden — use --include-deprecated to include them.`,
        "zh-CN": `已隐藏 ${footer.hiddenOffline} 个下线模型，使用 --include-deprecated 可包含它们。`,
      }),
    );
  }
  return lines.join("\n");
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

function detailText(
  detail: ModelGroup,
  includePredictConfig: boolean,
  localize: (text: LocalizedText) => string,
): string {
  const lines: string[] = [];
  const items = detail.items ?? [];
  const trunkItems = pickTrunkItems(items);
  const snapshotCount = items.length - trunkItems.length;

  lines.push(detail.name ?? detail.model);
  if (detail.description) lines.push(`  ${detail.description}`);
  if (detail.updateAt)
    lines.push(
      localize({
        "en-US": `  Updated: ${detail.updateAt}`,
        "zh-CN": `  更新日期: ${detail.updateAt}`,
      }),
    );
  lines.push("");

  // Items table
  const showStatus = items.some((item) => formatOfflineMarker(modelLifecycle(item)) !== "");
  const headers = [
    localize({ "en-US": "MODEL", "zh-CN": "模型" }),
    localize({ "en-US": "PROVIDER", "zh-CN": "提供商" }),
    localize({ "en-US": "CAPABILITIES", "zh-CN": "能力" }),
    localize({ "en-US": "CONTEXT", "zh-CN": "上下文" }),
    localize({ "en-US": "OUTPUT", "zh-CN": "输出" }),
    localize({ "en-US": "CATEGORY", "zh-CN": "类别" }),
    localize({ "en-US": "PRICE", "zh-CN": "价格" }),
  ];
  if (showStatus) headers.push(localize({ "en-US": "STATUS", "zh-CN": "状态" }));
  const rows = items.map((item) => {
    const row = [
      item.model ?? "-",
      item.provider ?? "-",
      (item.capabilities ?? []).join(",") || "-",
      item.contextWindow ? String(item.contextWindow) : "-",
      item.maxOutputTokens ? String(item.maxOutputTokens) : "-",
      item.category ?? "-",
      formatPriceCompact(item.prices),
    ];
    if (showStatus) row.push(formatOfflineMarker(modelLifecycle(item)));
    return row;
  });

  for (const line of formatTable(headers, rows)) lines.push(line);
  lines.push(
    localize({
      "en-US": `\nTotal: ${items.length} models (${trunkItems.length} trunk, ${snapshotCount} snapshots)`,
      "zh-CN": `\n总计: ${items.length} 个模型（${trunkItems.length} 个主干，${snapshotCount} 个快照）`,
    }),
  );

  // Pricing details per trunk item
  for (const item of trunkItems) {
    if (!item.prices?.length) continue;
    lines.push(
      localize({
        "en-US": `\n── Pricing: ${item.model} ──`,
        "zh-CN": `\n── 价格: ${item.model} ──`,
      }),
    );
    const priceHeaders = [
      localize({ "en-US": "TYPE", "zh-CN": "类型" }),
      localize({ "en-US": "PRICE", "zh-CN": "价格" }),
      localize({ "en-US": "UNIT", "zh-CN": "单位" }),
    ];
    const priceRows = item.prices.map((priceEntry) => [
      priceEntry.type ?? "-",
      String(priceEntry.price ?? "-"),
      priceEntry.priceUnit ?? "-",
    ]);
    for (const line of formatTable(priceHeaders, priceRows)) lines.push(line);
  }

  // QPM details per trunk item
  for (const item of trunkItems) {
    if (!item.qpmInfo || Object.keys(item.qpmInfo).length === 0) continue;
    lines.push(
      localize({
        "en-US": `\n── Rate Limits: ${item.model} ──`,
        "zh-CN": `\n── 速率限制: ${item.model} ──`,
      }),
    );
    const qpmHeaders = [
      localize({ "en-US": "TIER", "zh-CN": "层级" }),
      localize({ "en-US": "RPM", "zh-CN": "RPM" }),
      localize({ "en-US": "TPM", "zh-CN": "TPM" }),
      localize({ "en-US": "TPM_FIELD", "zh-CN": "TPM_FIELD" }),
    ];
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
    for (const line of formatTable(qpmHeaders, qpmRows)) lines.push(line);
  }

  // PredictConfig sections
  if (includePredictConfig) {
    for (const item of trunkItems) {
      if (!item.predictConfig || item.predictConfig.length === 0) continue;
      lines.push(
        localize({
          "en-US": `\n── predictConfig: ${item.model} ──`,
          "zh-CN": `\n── 参数配置: ${item.model} ──`,
        }),
      );
      lines.push(...predictConfigLines(item.predictConfig, localize));
    }
  }
  return lines.join("\n");
}

function formatDetailJson(detail: ModelGroup, includePredictConfig: boolean) {
  const items = detail.items ?? [];
  return {
    model: detail.model,
    name: detail.name,
    description: detail.description,
    updateAt: detail.updateAt,
    items: items.map((item) => {
      const lifecycle = modelLifecycle(item);
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
        modalities: itemModalities(item),
      };
      if (item.prices) entry.prices = item.prices;
      if (item.qpmInfo) entry.qpmInfo = item.qpmInfo;
      if (lifecycle.offline) entry.offline = true;
      if (lifecycle.upcomingOfflineAt) entry.upcomingOfflineAt = lifecycle.upcomingOfflineAt;
      if (lifecycle.announceUrl) entry.announceUrl = lifecycle.announceUrl;
      if (includePredictConfig && item.predictConfig) {
        entry.predictConfig = item.predictConfig;
      }
      return entry;
    }),
  };
}

function predictConfigLines(
  entries: PredictConfigEntry[],
  localize: (text: LocalizedText) => string,
): string[] {
  const lines: string[] = [];
  const headers = [
    localize({ "en-US": "PARAM", "zh-CN": "参数" }),
    localize({ "en-US": "KEY", "zh-CN": "键" }),
    localize({ "en-US": "DEFAULT", "zh-CN": "默认值" }),
    localize({ "en-US": "RANGE", "zh-CN": "范围" }),
  ];
  const rows = entries.map((entry) => [
    entry.name ?? "-",
    entry.key ?? "-",
    entry.default !== undefined ? JSON.stringify(entry.default) : "-",
    entry.range !== undefined ? JSON.stringify(entry.range) : "-",
  ]);
  for (const line of formatTable(headers, rows)) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export default defineCommand({
  description: {
    "en-US": "Browse model families or show detailed model info in the Bailian model marketplace",
    "zh-CN": "浏览百炼模型市场中的模型系列，或查看模型详细信息",
  },
  auth: "none",
  defaultOutput: "json",
  usageArgs:
    "[--model <model>] [--page <n>] [--page-size <n>] [--provider <p>] [--capability <c>] [--feature <f>] [--input-modality <m>] [--output-modality <m>] [--include-deprecated] [--enrich]",
  flags: LIST_FLAGS,
  exampleArgs: [
    "",
    "--provider alibaba",
    "--capability TG --capability Reasoning",
    "--input-modality Image --output-modality Text",
    "--include-deprecated",
    "--model qwen-max",
    "--model qwen-max --enrich --output json",
    "--feature function-calling --output json",
  ],
  notes: [
    {
      "en-US":
        "Both the catalog and --enrich parameter-schema endpoints are public — no console login needed.",
      "zh-CN": "模型目录和 --enrich 使用的参数 Schema Endpoint 均为公开接口，无需登录控制台。",
    },
    {
      "en-US":
        "Browse mode hides models that are already offline; use --include-deprecated to include them. Detail mode (--model) always lists every version and flags its status instead.",
      "zh-CN":
        "浏览模式会隐藏已下线的模型，可用 --include-deprecated 包含它们；详情模式（--model）始终列出全部版本并标注状态。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.output;
    const modelKey = flags.model;
    const call = anonymousConsoleCall(settings, {
      debug: (diagnostic) => ctx.output.debug(diagnostic),
    });

    // ── Detail mode ──
    if (modelKey) {
      const shouldEnrich = Boolean(flags.enrich);

      if (settings.dryRun) {
        ctx.output.result({ action: "model.detail", model: modelKey, enrich: shouldEnrich });
        return;
      }

      const detail = await fetchModelDetail(call, modelKey);

      if (!detail) {
        ctx.output.result(
          null,
          format === "text"
            ? {
                text: ctx.localize({
                  "en-US": `Model "${modelKey}" not found.`,
                  "zh-CN": `未找到模型 "${modelKey}"。`,
                }),
              }
            : undefined,
        );
        return;
      }

      if (shouldEnrich) {
        const trunkItems = pickTrunkItems(detail.items ?? []);
        await Promise.all(
          trunkItems.map(async (item) => {
            if (!item.model) return;
            const config = await fetchPredictConfig(call, item.model);
            if (config) item.predictConfig = config;
          }),
        );
      }

      ctx.output.result(
        formatDetailJson(detail, shouldEnrich),
        format === "text" ? { text: detailText(detail, shouldEnrich, ctx.localize) } : undefined,
      );
      return;
    }

    // ── Browse mode ──
    const params = {
      pageNo: flags.page,
      pageSize: flags.pageSize ?? 10,
      ...modelFilterParams(flags),
    };

    if (settings.dryRun) {
      ctx.output.result({
        action: "model.list",
        includeDeprecated: Boolean(flags.includeDeprecated),
        ...params,
      });
      return;
    }

    const { total, groups } = await fetchModelGroups(call, params);

    // The list API has no modality or lifecycle parameter, so both are applied to
    // each family's items; a family drops out once every version is filtered away.
    const listedGroups = groups
      .map((group) => ({
        ...group,
        items: filterModelsLocally(group.items ?? [], flags),
      }))
      .filter((group) => group.items.length > 0);

    const pageItems = groups.flatMap((group) => group.items ?? []);
    const hiddenOffline = flags.includeDeprecated
      ? 0
      : pageItems.filter((item) => modelLifecycle(item).offline).length;
    const hiddenModality = pageItems.filter(
      (item) => !matchesModality(item, flags.inputModality ?? [], flags.outputModality ?? []),
    ).length;

    ctx.output.result(
      formatBrowseJson(listedGroups, total),
      format === "text"
        ? { text: browseText(listedGroups, { total, hiddenOffline, hiddenModality }, ctx.localize) }
        : undefined,
    );
  },
});
