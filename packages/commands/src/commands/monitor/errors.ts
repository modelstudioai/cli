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

const ERROR_CODE_API = "zeldaEasy.bailian-telemetry.platform-model.getModelErrorCodeStatisticData";

interface ErrorCodeRow {
  httpStatusCode?: string;
  errorCode?: string;
  callCount?: number;
  callPercent?: number;
}

/** The gateway may return a bare array or a { result } / { list } / { data } wrapper. */
function toRows(resp: Record<string, unknown>): ErrorCodeRow[] {
  const candidate = resp.result ?? resp.list ?? resp.data;
  if (Array.isArray(candidate)) return candidate as ErrorCodeRow[];
  if (Array.isArray(resp)) return resp as unknown as ErrorCodeRow[];
  return [];
}

function printTable(rows: ErrorCodeRow[], startTime: number, endTime: number): void {
  const color = ansi(process.stdout);

  process.stdout.write(
    `${color.dim("Time Range:")} ${formatDateTime(startTime)} ~ ${formatDateTime(endTime)}\n\n`,
  );

  if (rows.length === 0) {
    process.stdout.write("No failures found in this range.\n");
    return;
  }

  const lines = renderBoxTable({
    headers: ["HTTP Status", "Error Code", "Calls", "Percent"],
    rows: rows.map((row) => [
      row.httpStatusCode ?? "-",
      row.errorCode ?? "-",
      formatNumber(row.callCount ?? 0),
      row.callPercent != null ? `${(row.callPercent * 100).toFixed(2)}%` : "-",
    ]),
    align: ["left", "left", "right", "right"],
  });
  for (const line of lines) process.stdout.write(line + "\n");
}

export default defineCommand({
  description: {
    "en-US": "Show failure breakdown by HTTP status code and error code",
    "zh-CN": "查看失败明细（按 HTTP 状态码与错误码统计分布）",
  },
  auth: "console",
  usageArgs: "[--model <model>] [--days <days>] [flags]",
  flags: {
    ...TELEMETRY_TIME_FLAGS,
    ...TELEMETRY_MONITOR_FILTER_FLAGS,
  },
  exampleArgs: [
    "",
    "--model qwen3.6-plus --days 1",
    "--model qwen3.6-plus --api-key-id 12345",
    "--output json",
  ],
  notes: [
    {
      "en-US": "Only real-time (online) inference calls are counted in monitor statistics.",
      "zh-CN": "监控统计仅覆盖实时（在线）推理调用。",
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
          api: ERROR_CODE_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, ERROR_CODE_API, reqDTO);
    const rows = toRows(resp);

    if (format === "json") {
      emitResult(
        {
          period: { start: formatDateTime(startTime), end: formatDateTime(endTime) },
          list: rows,
        },
        format,
      );
      return;
    }

    printTable(rows, startTime, endTime);
  },
});
