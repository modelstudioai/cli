import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { ansi, emitResult, displayWidth, padEnd } from "bailian-cli-runtime";
import { formatNumber, formatDateTime } from "../shared/format.ts";
import {
  TELEMETRY_TIME_FLAGS,
  TELEMETRY_MONITOR_FILTER_FLAGS,
  buildTelemetryFilters,
  ensureTelemetryRegionSupported,
  pollTelemetryData,
  resolveTimeRange,
} from "../shared/telemetry.ts";

const STATISTIC_API = "zeldaEasy.bailian-telemetry.platform-model.getModelStatistic";

interface UsageItemWithUnit {
  key: string;
  value: number;
  unit: string;
}

interface ModelStatistic {
  resourceCount?: number;
  callCount?: number;
  callSuccessCount?: number;
  streamCallCount?: number;
  callFailedCount?: number;
  call4xxErrorCount?: number;
  call5xxErrorCount?: number;
  avgCallDuration?: number;
  avgFirstTokenDuration?: number;
  usages?: UsageItemWithUnit[];
}

function printStatistic(stat: ModelStatistic, startTime: number, endTime: number): void {
  const color = ansi(process.stdout);

  process.stdout.write(
    `${color.dim("Time Range:")} ${formatDateTime(startTime)} ~ ${formatDateTime(endTime)}\n\n`,
  );

  const failedPercent =
    stat.callCount && stat.callFailedCount != null
      ? `${((stat.callFailedCount / stat.callCount) * 100).toFixed(2)}%`
      : "-";

  const rows: [string, string][] = [
    ["Models Called", formatNumber(stat.resourceCount ?? 0)],
    ["Total Calls", formatNumber(stat.callCount ?? 0)],
    ["Successful Calls", formatNumber(stat.callSuccessCount ?? 0)],
    ["Failed Calls", formatNumber(stat.callFailedCount ?? 0)],
    ["Failure Rate", failedPercent],
    ["4xx Errors", formatNumber(stat.call4xxErrorCount ?? 0)],
    ["5xx Errors", formatNumber(stat.call5xxErrorCount ?? 0)],
    [
      "Avg Call Duration",
      stat.avgCallDuration != null ? `${formatNumber(stat.avgCallDuration)} ms` : "-",
    ],
    [
      "Avg First Token Duration",
      stat.avgFirstTokenDuration != null ? `${formatNumber(stat.avgFirstTokenDuration)} ms` : "-",
    ],
  ];

  for (const usage of stat.usages ?? []) {
    rows.push([`${usage.key}${usage.unit ? ` [${usage.unit}]` : ""}`, formatNumber(usage.value)]);
  }

  const maxLabel = Math.max(...rows.map(([label]) => displayWidth(label)));
  for (const [label, value] of rows) {
    process.stdout.write(`${color.bold(padEnd(label, maxLabel + 2))}${value}\n`);
  }
}

export default defineCommand({
  description: {
    "en-US": "Show aggregated model call statistics (calls, failures, latency, token usage)",
    "zh-CN": "查看模型调用汇总统计（调用量、失败率、耗时、Token 用量）",
  },
  auth: "console",
  usageArgs: "[--model <model>] [--days <days>] [flags]",
  flags: {
    ...TELEMETRY_TIME_FLAGS,
    ...TELEMETRY_MONITOR_FILTER_FLAGS,
  },
  exampleArgs: [
    "",
    "--days 30",
    "--model qwen3.6-plus",
    "--model qwen3.6-plus --api-key-id 12345 --days 7",
    "--output json",
  ],
  notes: [
    {
      "en-US": "Only real-time (online) inference calls are counted in the overview.",
      "zh-CN": "汇总统计仅覆盖实时（在线）推理调用。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const { startTime, endTime } = resolveTimeRange(flags);

    const reqDTO = {
      ...buildTelemetryFilters(flags, settings.workspaceId),
      startTime,
      endTime,
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: STATISTIC_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const stat = (await pollTelemetryData(ctx.client, STATISTIC_API, reqDTO)) as ModelStatistic;

    if (format === "json") {
      emitResult(
        {
          period: { start: formatDateTime(startTime), end: formatDateTime(endTime) },
          ...stat,
        },
        format,
      );
      return;
    }

    printStatistic(stat, startTime, endTime);
  },
});
