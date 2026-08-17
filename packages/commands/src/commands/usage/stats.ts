import { defineCommand, BailianError, ExitCode, detectOutputFormat } from "bailian-cli-core";
import { ansi, emitResult } from "bailian-cli-runtime";
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

function printOverview(
  stat: OverviewStatistic,
  startTime: number,
  endTime: number,
  days: number,
): void {
  const color = ansi(process.stdout);

  process.stdout.write(
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
    process.stdout.write(`${color.bold(padEnd(label, maxLabel + 2))}${value}\n`);
  }
}

function printModelTable(
  items: ModelStatisticItem[],
  startTime: number,
  endTime: number,
  days: number,
): void {
  const color = ansi(process.stdout);

  process.stdout.write(
    `${color.dim("Time Range Period:")} ${formatDate(startTime)} ~ ${formatDate(endTime)} ${color.dim(`(${days} days)`)}\n\n`,
  );

  if (items.length === 0) {
    process.stdout.write("No usage data found.\n");
    return;
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

  process.stdout.write(headerLine + "\n");
  process.stdout.write(separator + "\n");

  for (const row of rows) {
    const cells = row.map((cell, col) => padEnd(cell, widths[col]));
    process.stdout.write(cells.join("  ") + "\n");
  }

  process.stdout.write(color.dim(`\nTotal: ${items.length} models`) + "\n");
}

export default defineCommand({
  description: "Query model usage statistics",
  auth: "console",
  usageArgs: "[--model <model>] [--days <days>] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model name(s), comma-separated; omit for overview",
    },
    days: {
      type: "string",
      valueHint: "<days>",
      description: "Number of days (default: 7)",
    },
    type: {
      type: "string",
      valueHint: "<type>",
      description: "Model type: Text, Vision, Multimodal, Audio, Embedding",
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
    const format = detectOutputFormat(settings.output);

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
        emitResult(
          { api: LIST_API, data: { reqDTO: { ...baseReqDTO, model: models.join(",") } } },
          format,
        );
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

      if (format === "json") {
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
        emitResult(
          {
            period: { start: formatDate(startTime), end: formatDate(endTime), days: daysFlag },
            items,
          },
          format,
        );
        return;
      }

      printModelTable(allItems, startTime, endTime, daysFlag);
    } else {
      const reqDTO: Record<string, unknown> = {
        startTime,
        endTime,
        modelCallSource: "Online",
        filterWorkspaceId: workspaceId,
      };
      if (typeFlag) reqDTO.obsModelType = typeFlag;

      if (settings.dryRun) {
        emitResult({ api: OVERVIEW_API, data: { reqDTO } }, format);
        return;
      }

      const result = await pollTelemetryApi(ctx.client, OVERVIEW_API, reqDTO);
      if (!result) {
        throw new BailianError("Request timed out.", ExitCode.TIMEOUT);
      }

      const stat = extractOverviewData(result);

      if (format === "json") {
        if (!stat) {
          emitResult(
            {
              period: { start: formatDate(startTime), end: formatDate(endTime), days: daysFlag },
              modelsCalled: 0,
              successfulCalls: 0,
            },
            format,
          );
          return;
        }
        emitResult(
          {
            period: { start: formatDate(startTime), end: formatDate(endTime), days: daysFlag },
            modelsCalled: stat.modelCount ?? 0,
            successfulCalls: stat.callSuccessCount ?? 0,
            usages: (stat.usages ?? []).map((u) => ({
              key: u.key,
              value: u.value,
              unit: u.unit,
              label: USAGE_KEY_LABELS[u.key]?.en ?? u.key,
            })),
          },
          format,
        );
        return;
      }

      if (!stat) {
        process.stdout.write("No usage data found.\n");
        return;
      }

      printOverview(stat, startTime, endTime, daysFlag);
    }
  },
});
