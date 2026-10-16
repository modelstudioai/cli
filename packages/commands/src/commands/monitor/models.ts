import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { ansi, emitResult, renderBoxTable } from "bailian-cli-runtime";
import { formatNumber, formatDateTime } from "../shared/format.ts";
import {
  TELEMETRY_TIME_FLAGS,
  TELEMETRY_MONITOR_FILTER_FLAGS,
  buildTelemetryFilters,
  ensureTelemetryRegionSupported,
  pollTelemetryData,
  resolveTimeRange,
} from "../shared/telemetry.ts";

const LIST_API = "zeldaEasy.bailian-telemetry.platform-model.listModelStatisticData";

const SORT_FIELDS = [
  "modelAndWorkspaceId",
  "callCount",
  "callSuccessCount",
  "callFailedCount",
  "callFailedPercent",
  "avgCallDuration",
  "avgFirstTokenDuration",
] as const;

interface UsageItemWithUnit {
  key: string;
  value: number;
  unit: string;
}

interface ModelStatisticItem {
  workspaceId?: string;
  model?: string;
  apikeyId?: string;
  callCount?: number;
  callSuccessCount?: number;
  callFailedCount?: number;
  callFailedPercent?: number;
  call4xxErrorCount?: number;
  call5xxErrorCount?: number;
  avgCallDuration?: number;
  avgFirstTokenDuration?: number;
  avgTpm?: number;
  avgRpm?: number;
  usages?: UsageItemWithUnit[];
}

function printTable(items: ModelStatisticItem[], startTime: number, endTime: number): void {
  const color = ansi(process.stdout);

  process.stdout.write(
    `${color.dim("Time Range:")} ${formatDateTime(startTime)} ~ ${formatDateTime(endTime)}\n\n`,
  );

  if (items.length === 0) {
    process.stdout.write("No monitor data found.\n");
    return;
  }

  const headers = [
    "Model",
    "API Key",
    "Calls",
    "Failed",
    "Fail%",
    "Avg Duration",
    "Avg First Token",
  ];
  const rows = items.map((item) => [
    item.model ?? "-",
    item.apikeyId ?? "-",
    formatNumber(item.callCount ?? 0),
    formatNumber(item.callFailedCount ?? 0),
    item.callFailedPercent != null ? `${(item.callFailedPercent * 100).toFixed(2)}%` : "-",
    item.avgCallDuration != null ? `${formatNumber(Math.round(item.avgCallDuration))} ms` : "-",
    item.avgFirstTokenDuration != null
      ? `${formatNumber(Math.round(item.avgFirstTokenDuration))} ms`
      : "-",
  ]);

  const lines = renderBoxTable({
    headers,
    rows,
    align: ["left", "left", "right", "right", "right", "right", "right"],
    cellColor: (_rowIndex, colIndex, value) => {
      if (colIndex !== 4 || value === "-") return undefined;
      const percent = Number.parseFloat(value);
      if (percent >= 5) return color.red(value);
      if (percent > 0) return color.yellow(value);
      return color.green(value);
    },
  });
  for (const line of lines) process.stdout.write(line + "\n");

  process.stdout.write(color.dim(`\nTotal: ${items.length} rows`) + "\n");
}

export default defineCommand({
  description: {
    "en-US": "List per-model / per-API-key call statistics with server-side sort and paging",
    "zh-CN": "按模型 / API Key 维度查看调用明细统计（服务端排序与分页）",
  },
  auth: "console",
  usageArgs: "[--model <model>] [--sort-by <field>] [flags]",
  flags: {
    ...TELEMETRY_TIME_FLAGS,
    ...TELEMETRY_MONITOR_FILTER_FLAGS,
    sortBy: {
      type: "string",
      valueHint: "<field>",
      choices: SORT_FIELDS,
      description: {
        "en-US": "Sort field (default: callCount)",
        "zh-CN": "排序字段（默认：callCount）",
      },
    },
    order: {
      type: "string",
      valueHint: "<order>",
      choices: ["ASC", "DESC"] as const,
      description: {
        "en-US": "Sort order (default: DESC)",
        "zh-CN": "排序方向（默认：DESC）",
      },
    },
    maxResults: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Rows per page, 1-50 (default: 10)",
        "zh-CN": "每页数量，范围 1-50（默认：10）",
      },
    },
    skip: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Rows to skip (default: 0)",
        "zh-CN": "跳过的记录数（默认：0）",
      },
    },
    nextToken: {
      type: "string",
      valueHint: "<token>",
      description: {
        "en-US": "Pagination token from a previous response",
        "zh-CN": "上一次响应返回的分页标记",
      },
    },
  },
  notes: [
    {
      "en-US": "Only real-time (online) inference calls are counted in monitor statistics.",
      "zh-CN": "监控统计仅覆盖实时（在线）推理调用。",
    },
  ],
  exampleArgs: [
    "",
    "--model qwen3.6-plus --days 1",
    "--sort-by callFailedPercent --order DESC",
    "--max-results 50 --output json",
  ],
  validate: (flags) => {
    if (flags.maxResults != null && (flags.maxResults < 1 || flags.maxResults > 50)) {
      return "--max-results must be between 1 and 50.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const { startTime, endTime } = resolveTimeRange(flags);

    const reqDTO = {
      ...buildTelemetryFilters(flags, settings.workspaceId),
      startTime,
      endTime,
      sortField: flags.sortBy ?? "callCount",
      sortOrder: flags.order ?? "DESC",
      maxResults: flags.maxResults ?? 10,
      skip: flags.skip ?? 0,
      nextToken: flags.nextToken,
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: LIST_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, LIST_API, reqDTO);
    const list = ((resp.list as ModelStatisticItem[]) ?? []).filter(Boolean);
    const nextToken = resp.nextToken as string | undefined;

    if (format === "json") {
      emitResult(
        {
          period: { start: formatDateTime(startTime), end: formatDateTime(endTime) },
          totalCount: resp.totalCount ?? 0,
          nextToken,
          list,
        },
        format,
      );
      return;
    }

    printTable(list, startTime, endTime);
    if (nextToken) {
      process.stdout.write(`Next page: --next-token ${nextToken}\n`);
    }
  },
});
