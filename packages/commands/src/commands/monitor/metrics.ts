import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { ansi, emitResult } from "bailian-cli-runtime";
import { formatNumber, formatDateTime } from "../shared/format.ts";
import { parseCommaList } from "../shared/params.ts";
import {
  TELEMETRY_TIME_FLAGS,
  TELEMETRY_MONITOR_FILTER_FLAGS,
  autoStep,
  buildTelemetryFilters,
  ensureTelemetryRegionSupported,
  METRIC_STEPS,
  pollTelemetryData,
  resolveOssPayload,
  resolveTimeRange,
} from "../shared/telemetry.ts";

const METRICS_API = "zeldaEasy.bailian-telemetry.platform-model.getModelMonitorDataWithOss";

/** Metrics exposed by the platform model monitor. */
const METRIC_NAMES = [
  "model_call_count",
  "model_call_duration",
  "model_first_token_duration",
  "model_generation_duration_per_token",
  "model_call_failed_count",
  "model_call_4xx_count",
  "model_call_5xx_count",
  "model_call_429_count",
  "model_call_data_inspection_failed_count",
  "model_total_amount",
  "model_input_amount",
  "model_output_amount",
  "model_usage",
  "model_tps_per_request",
  "model_cache_hit_percent",
  "model_ptu_token_quota",
  "model_ptu_usage_quota",
  "model_ptu_total_tokens",
  "model_ptu_quota",
  "model_ptu_utilization",
] as const;

const AGG_METHODS = [
  "sum",
  "avg",
  "max",
  "min",
  "p50",
  "p95",
  "p99",
  "cumsum",
  "cumavg",
  "sum_pm",
] as const;

/** Failure-family metrics whose drill-down lives in `monitor errors`. */
const FAILURE_METRICS = new Set([
  "model_call_failed_count",
  "model_call_4xx_count",
  "model_call_5xx_count",
  "model_call_429_count",
  "model_call_data_inspection_failed_count",
]);

interface MonitorSeries {
  metricName: string;
  aggMethod: string;
  labels?: Record<string, string>;
  points: { timestamp: number; value: number }[];
  step?: number;
}

function seriesTitle(series: MonitorSeries): string {
  const labels = series.labels
    ? Object.entries(series.labels)
        .map(([key, value]) => `${key}=${value}`)
        .join(",")
    : "";
  const base = `${series.metricName} (${series.aggMethod})`;
  return labels ? `${base} {${labels}}` : base;
}

function printSeries(allSeries: MonitorSeries[]): void {
  const color = ansi(process.stdout);

  if (allSeries.length === 0) {
    process.stdout.write("No monitor data found.\n");
    return;
  }

  for (const series of allSeries) {
    process.stdout.write(color.bold(seriesTitle(series)) + "\n");
    const points = series.points ?? [];
    if (points.length === 0) {
      process.stdout.write(color.dim("  (no data points)") + "\n\n");
      continue;
    }
    for (const point of points) {
      process.stdout.write(
        `  ${color.dim(formatDateTime(point.timestamp))}  ${formatNumber(point.value)}\n`,
      );
    }
    process.stdout.write("\n");
  }
}

export default defineCommand({
  description: {
    "en-US": "Query time-series monitor metrics (RPM/TPM, latency percentiles, token usage)",
    "zh-CN": "查询时序监控指标（RPM/TPM、耗时分位数、Token 用量等）",
  },
  auth: "console",
  usageArgs: "--metric <name>[,<name>...] [flags]",
  flags: {
    ...TELEMETRY_TIME_FLAGS,
    ...TELEMETRY_MONITOR_FILTER_FLAGS,
    metric: {
      type: "string",
      valueHint: "<name>[,<name>...]",
      required: true,
      description: {
        "en-US": "Metric name(s), comma-separated; see notes for the full list",
        "zh-CN": "指标名称，多个以逗号分隔；完整列表见下方说明",
      },
    },
    agg: {
      type: "string",
      valueHint: "<method>",
      choices: AGG_METHODS,
      description: {
        "en-US": "Aggregation method applied to every metric (default: sum)",
        "zh-CN": "应用于所有指标的聚合方式（默认：sum）",
      },
    },
    step: {
      type: "number",
      valueHint: "<seconds>",
      description: {
        "en-US": "Data point interval in seconds: 60, 3600 or 86400 (default: auto by time range)",
        "zh-CN": "数据点间隔（秒）：60、3600 或 86400，默认按时间范围自动选择",
      },
    },
  },
  notes: [
    {
      "en-US": `Metrics: ${METRIC_NAMES.join(", ")}`,
      "zh-CN": `可用指标：${METRIC_NAMES.join("、")}`,
    },
    {
      "en-US": "Only real-time (online) inference calls are counted in monitor statistics.",
      "zh-CN": "监控统计仅覆盖实时（在线）推理调用。",
    },
  ],
  exampleArgs: [
    "--metric model_call_count --days 1",
    "--metric model_call_duration --agg p99 --model qwen3.6-plus --days 1",
    "--metric model_call_count,model_call_failed_count --step 300 --start-time 2026-08-01",
    "--metric model_total_amount --output json",
  ],
  validate: (flags) => {
    const unknown = parseCommaList(flags.metric).filter(
      (name) => !(METRIC_NAMES as readonly string[]).includes(name),
    );
    if (unknown.length > 0) {
      return `Unknown metric: ${unknown.join(", ")}. See notes for the full list.`;
    }
    if (flags.step != null && !(METRIC_STEPS as readonly number[]).includes(flags.step)) {
      return `--step must be one of ${METRIC_STEPS.join(", ")} seconds.`;
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const { startTime, endTime } = resolveTimeRange(flags);

    const metricFilters = parseCommaList(flags.metric).map((metricName) => ({
      metricName,
      aggMethod: flags.agg ?? "sum",
    }));

    const reqDTO = {
      ...buildTelemetryFilters(flags, settings.workspaceId),
      metricFilters,
      startTime,
      endTime,
      step: flags.step ?? autoStep(startTime, endTime),
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: METRICS_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, METRICS_API, reqDTO);
    const allSeries = (await resolveOssPayload<MonitorSeries[]>(resp)) ?? [];

    if (format === "json") {
      emitResult(
        {
          period: { start: formatDateTime(startTime), end: formatDateTime(endTime) },
          step: reqDTO.step,
          series: allSeries,
        },
        format,
      );
      return;
    }

    printSeries(allSeries);
    if (parseCommaList(flags.metric).some((metricName) => FAILURE_METRICS.has(metricName))) {
      process.stdout.write(
        ansi(process.stdout).dim(
          `\nFor the error-code breakdown, run \`${ctx.identity.binName} monitor errors\`.\n`,
        ),
      );
    }
  },
});
