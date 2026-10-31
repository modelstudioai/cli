import { defineCommand, BailianError, ExitCode } from "bailian-cli-core";
import { ansi } from "bailian-cli-runtime";
import { displayWidth, padEnd } from "bailian-cli-runtime";
import {
  LIST_API,
  OVERVIEW_API,
  USAGE_KEY_LABELS,
  extractListData,
  extractOverviewData,
  formatDate,
  pollTelemetryApi,
  requireWorkspaceId,
  resolveUsageMap,
  type ModelStatisticItem,
  type OverviewStatistic,
} from "./shared.ts";
import { formatNumber } from "../shared/format.ts";

interface UsageLabel {
  en: string;
  unit?: string;
}

function formatLabel(label: UsageLabel): string {
  const unitSuffix = label.unit ? ` [${label.unit}]` : "";
  return `${label.en}${unitSuffix}`;
}

function renderOverview(
  stat: OverviewStatistic,
  startTime: number,
  endTime: number,
  days: number,
): string {
  const textChunks: string[] = [];

  const color = ansi(process.stdout);

  textChunks.push(
    `${color.dim("Time Range Period:")} ${formatDate(startTime)} ~ ${formatDate(endTime)} ${color.dim(`(${days} days)`)}\n\n`,
  );

  const rows: [string, string][] = [
    ["Models Called", formatNumber(stat.modelCount ?? 0)],
    ["Successful Calls", formatNumber(stat.callSuccessCount ?? 0)],
  ];

  for (const usage of stat.usages ?? []) {
    const label = USAGE_KEY_LABELS[usage.key];
    const text = label ? formatLabel(label) : usage.key;
    rows.push([text, formatNumber(usage.value)]);
  }

  const maxLabel = Math.max(...rows.map(([label]) => displayWidth(label)));
  for (const [label, value] of rows) {
    textChunks.push(`${color.bold(padEnd(label, maxLabel + 2))}${value}\n`);
  }

  return textChunks.join("").replace(/\n$/, "");
}

function renderModelTable(
  items: ModelStatisticItem[],
  startTime: number,
  endTime: number,
  days: number,
): string {
  const textChunks: string[] = [];

  const color = ansi(process.stdout);

  textChunks.push(
    `${color.dim("Time Range Period:")} ${formatDate(startTime)} ~ ${formatDate(endTime)} ${color.dim(`(${days} days)`)}\n\n`,
  );

  if (items.length === 0) {
    textChunks.push("No usage data found.\n");
    return textChunks.join("").replace(/\n$/, "");
  }

  const usageKeys = new Set<string>();
  const itemUsages = items.map((item) => {
    const usage = resolveUsageMap(item);
    for (const key of Object.keys(usage)) usageKeys.add(key);
    return usage;
  });

  const orderedKeys = [...usageKeys].sort((keyA, keyB) => {
    const order = [
      "total_token",
      "input_token",
      "output_token",
      "input_token_cache",
      "image_number",
      "video_duration",
      "content_duration",
      "tts_text_number",
    ];
    const idxA = order.indexOf(keyA);
    const idxB = order.indexOf(keyB);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  const headers = ["Model", "Calls", ...orderedKeys.map((key) => USAGE_KEY_LABELS[key]?.en ?? key)];
  const rows = items.map((item, idx) => [
    item.model,
    formatNumber(item.callSuccessCount ?? 0),
    ...orderedKeys.map((key) => {
      const val = itemUsages[idx][key];
      return val != null ? formatNumber(val) : "-";
    }),
  ]);

  const widths = headers.map((label, col) =>
    Math.max(displayWidth(label), ...rows.map((row) => displayWidth(row[col]))),
  );

  const headerLine = headers.map((label, col) => color.bold(padEnd(label, widths[col]))).join("  ");
  const separator = widths.map((width) => color.dim("─".repeat(width))).join("──");

  textChunks.push(headerLine + "\n");
  textChunks.push(separator + "\n");

  for (const row of rows) {
    const cells = row.map((cell, col) => padEnd(cell, widths[col]));
    textChunks.push(cells.join("  ") + "\n");
  }

  textChunks.push(color.dim(`\nTotal: ${items.length} models`) + "\n");

  return textChunks.join("").replace(/\n$/, "");
}

export default defineCommand({
  description: { "en-US": "Query model usage statistics", "zh-CN": "查询模型用量统计" },
  auth: "console",
  usageArgs: "[--model <model>] [--days <days>] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Model name(s), comma-separated; omit for overview",
        "zh-CN": "模型名称，多个名称以逗号分隔；省略时查看概览",
      },
    },
    days: {
      type: "string",
      valueHint: "<days>",
      description: { "en-US": "Number of days (default: 7)", "zh-CN": "天数（默认：7）" },
    },
    type: {
      type: "string",
      valueHint: "<type>",
      description: {
        "en-US": "Model type: Text, Vision, Multimodal, Audio, Embedding",
        "zh-CN": "模型类型：Text、Vision、Multimodal、Audio、Embedding",
      },
    },
  },
  exampleArgs: [
    "",
    "--days 30",
    "--model qwen-turbo",
    "--model qwen-turbo --days 7",
    "--model qwen3.6-plus,deepseek-v4-pro",
    "--type Text --days 14",
    "--output json",
  ],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const modelFlag = flags.model || undefined;
    const daysFlag = Number(flags.days) || 7;
    const typeFlag = flags.type || undefined;
    const format = settings.output;

    const workspaceId = requireWorkspaceId(settings, identity.binName);

    const endTime = Date.now();
    const startTime = endTime - daysFlag * 24 * 60 * 60 * 1000;

    if (modelFlag) {
      const models = [
        ...new Set(
          modelFlag
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ];

      const baseReqDTO: Record<string, unknown> = {
        startTime,
        endTime,
        modelCallSource: "Online",
        filterWorkspaceId: workspaceId,
        maxResults: 50,
        skip: 0,
        sortField: "success_count",
        sortOrder: "DESC",
      };
      if (typeFlag) baseReqDTO.obsModelType = typeFlag;

      if (settings.dryRun) {
        ctx.output.result({
          api: LIST_API,
          data: { reqDTO: { ...baseReqDTO, model: models.join(",") } },
        });
        return;
      }

      const results = await Promise.all(
        models.map((model) => pollTelemetryApi(ctx.client, LIST_API, { ...baseReqDTO, model })),
      );

      const allItems: ModelStatisticItem[] = [];
      for (const result of results) {
        if (!result) continue;
        const listData = extractListData(result);
        allItems.push(...listData.list);
      }

      const items = allItems.map((item) => {
        const usage = resolveUsageMap(item);
        const clean: Record<string, unknown> = {
          model: item.model,
          successfulCalls: item.callSuccessCount ?? 0,
        };
        for (const [key, val] of Object.entries(usage)) {
          clean[key] = val;
        }
        return clean;
      });
      ctx.output.result(
        {
          period: { start: formatDate(startTime), end: formatDate(endTime), days: daysFlag },
          items,
        },
        format === "text"
          ? { text: renderModelTable(allItems, startTime, endTime, daysFlag) }
          : undefined,
      );
    } else {
      const reqDTO: Record<string, unknown> = {
        startTime,
        endTime,
        modelCallSource: "Online",
        filterWorkspaceId: workspaceId,
      };
      if (typeFlag) reqDTO.obsModelType = typeFlag;

      if (settings.dryRun) {
        ctx.output.result({ api: OVERVIEW_API, data: { reqDTO } });
        return;
      }

      const result = await pollTelemetryApi(ctx.client, OVERVIEW_API, reqDTO);
      if (!result) {
        throw new BailianError("Request timed out.", ExitCode.TIMEOUT);
      }

      const stat = extractOverviewData(result);

      ctx.output.result(
        {
          period: { start: formatDate(startTime), end: formatDate(endTime), days: daysFlag },
          modelsCalled: stat?.modelCount ?? 0,
          successfulCalls: stat?.callSuccessCount ?? 0,
          ...(stat
            ? {
                usages: (stat.usages ?? []).map((usage) => ({
                  key: usage.key,
                  value: usage.value,
                  unit: usage.unit,
                  label: USAGE_KEY_LABELS[usage.key]?.en ?? usage.key,
                })),
              }
            : {}),
        },
        format === "text"
          ? {
              text: stat
                ? renderOverview(stat, startTime, endTime, daysFlag)
                : ctx.localize({
                    "en-US": "No usage data found.",
                    "zh-CN": "未找到用量数据。",
                  }),
            }
          : undefined,
      );
    }
  },
});
