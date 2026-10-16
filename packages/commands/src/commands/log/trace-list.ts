import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { ansi, emitResult, renderBoxTable } from "bailian-cli-runtime";
import { formatNumber, formatDateTime } from "../shared/format.ts";
import {
  TELEMETRY_LOG_TIME_FLAGS,
  ensureTelemetryRegionSupported,
  pollTelemetryData,
  resolveOssPayload,
  resolveTimeRange,
} from "../shared/telemetry.ts";

const LIST_TRACES_API = "zeldaEasy.bailian-telemetry.trace.listTracesWithOss";

/** '0' = unset, '1' = ok, '2' = error (OpenTelemetry status code). */
export const TRACE_STATUS_LABELS: Record<string, string> = {
  "0": "Unset",
  "1": "OK",
  "2": "Error",
};

export interface TraceEntry {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  spanName: string;
  spanKind?: string;
  resourceId?: string;
  startTime: number;
  duration?: string;
  callDuration?: number;
  totalTokens?: number;
  statusCode?: "0" | "1" | "2";
  statusMessage?: string;
  traceRequestId?: string;
  children?: TraceEntry[];
}

interface TraceListPayload {
  totalCount?: number;
  list?: TraceEntry[];
}

function printTraceTable(list: TraceEntry[]): void {
  const color = ansi(process.stdout);

  if (list.length === 0) {
    process.stdout.write("No traces found in this range.\n");
    return;
  }

  const lines = renderBoxTable({
    headers: ["Time", "Trace ID", "Span", "Status", "Duration", "Tokens"],
    rows: list.map((trace) => [
      formatDateTime(trace.startTime),
      trace.traceId ?? "-",
      trace.spanName ?? "-",
      TRACE_STATUS_LABELS[trace.statusCode ?? "0"] ?? trace.statusCode ?? "-",
      trace.callDuration != null
        ? `${formatNumber(trace.callDuration)} ms`
        : (trace.duration ?? "-"),
      trace.totalTokens != null ? formatNumber(trace.totalTokens) : "-",
    ]),
    align: ["left", "left", "left", "left", "right", "right"],
    cellColor: (_rowIndex, colIndex, value) => {
      if (colIndex !== 3) return undefined;
      if (value === "Error") return color.red(value);
      if (value === "OK") return color.green(value);
      return undefined;
    },
  });
  for (const line of lines) process.stdout.write(line + "\n");
}

export default defineCommand({
  description: {
    "en-US": "List call traces for a model or app",
    "zh-CN": "查询模型或应用的调用链列表",
  },
  auth: "console",
  usageArgs: "--resource-id <id> [flags]",
  flags: {
    ...TELEMETRY_LOG_TIME_FLAGS,
    resourceId: {
      type: "string",
      valueHint: "<id>",
      required: true,
      description: {
        "en-US": "Model name or app ID to query traces for",
        "zh-CN": "要查询调用链的模型名称或应用 ID",
      },
    },
    resourceType: {
      type: "string",
      valueHint: "<type>",
      choices: ["model", "app"] as const,
      description: {
        "en-US": "Resource type: model, app (default: model)",
        "zh-CN": "资源类型：model、app（默认：model）",
      },
    },
    maxResults: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Rows per page (default: 20)",
        "zh-CN": "每页数量（默认：20）",
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
  },
  exampleArgs: [
    "--resource-id qwen3.6-plus",
    "--resource-id qwen3.6-plus --hours 24 --max-results 50",
    "--resource-id 123456 --resource-type app --output json",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const { startTime, endTime } = resolveTimeRange(flags, 1 / 24);

    const reqDTO = {
      ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
      resourceId: flags.resourceId,
      resourceType: flags.resourceType ?? "model",
      startTime,
      endTime,
      maxResults: flags.maxResults ?? 20,
      skip: flags.skip ?? 0,
      nextToken: "",
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: LIST_TRACES_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, LIST_TRACES_API, reqDTO);
    // The payload is either the trace array itself or a { totalCount, list } wrapper.
    const payload = await resolveOssPayload<TraceEntry[] | TraceListPayload>(resp);
    const list = Array.isArray(payload) ? payload : (payload?.list ?? []);
    const totalCount = Array.isArray(payload) ? undefined : payload?.totalCount;

    if (format === "json") {
      emitResult({ totalCount, list }, format);
      return;
    }

    printTraceTable(list);
  },
});
