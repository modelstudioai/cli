import {
  defineCommand,
  BailianError,
  ExitCode,
  detectOutputFormat,
  effectiveConsoleGatewayConfig,
} from "bailian-cli-core";
import { ansi, emitResult } from "bailian-cli-runtime";
import { formatNumber, formatDateTime } from "../shared/format.ts";
import {
  TELEMETRY_LOG_TIME_FLAGS,
  ensureTelemetryRegionSupported,
  pollTelemetryData,
  resolveOssPayload,
  resolveTimeRange,
} from "../shared/telemetry.ts";
import { TRACE_STATUS_LABELS, type TraceEntry } from "./trace-list.ts";

const GET_TRACE_API = "zeldaEasy.bailian-telemetry.trace.getTraceWithOss";

function printSpan(span: TraceEntry, depth: number): void {
  const color = ansi(process.stdout);
  const indent = "  ".repeat(depth);
  const status = TRACE_STATUS_LABELS[span.statusCode ?? "0"] ?? "-";
  const duration =
    span.callDuration != null ? `${formatNumber(span.callDuration)} ms` : (span.duration ?? "-");
  const tokens = span.totalTokens != null ? `, ${formatNumber(span.totalTokens)} tokens` : "";
  const statusText = status === "Error" ? color.red(status) : status;

  process.stdout.write(
    `${indent}${span.spanName ?? "-"}  ${color.dim(`[${statusText}, ${duration}${tokens}]`)}\n`,
  );
  if (span.statusCode === "2" && span.statusMessage) {
    process.stdout.write(`${indent}  ${color.red(span.statusMessage)}\n`);
  }
  for (const child of span.children ?? []) {
    printSpan(child, depth + 1);
  }
}

export default defineCommand({
  description: {
    "en-US": "Show a single call trace with its span tree",
    "zh-CN": "查看单条调用链详情（含 span 树）",
  },
  auth: "console",
  usageArgs: "--trace-id <id> [flags]",
  flags: {
    ...TELEMETRY_LOG_TIME_FLAGS,
    traceId: {
      type: "string",
      valueHint: "<id>",
      required: true,
      description: {
        "en-US": "Trace ID (from `log trace list`)",
        "zh-CN": "调用链 ID（可由 log trace list 获得）",
      },
    },
    resourceId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Model name or app ID (narrows the search)",
        "zh-CN": "模型名称或应用 ID（缩小查询范围）",
      },
    },
  },
  exampleArgs: [
    "--trace-id 0a1b2c3d4e5f --hours 24",
    "--trace-id 0a1b2c3d4e5f --resource-id qwen3.6-plus",
    "--trace-id 0a1b2c3d4e5f --output json",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const { startTime, endTime } = resolveTimeRange(flags, 1);

    const reqDTO = {
      ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
      traceId: flags.traceId,
      resourceId: flags.resourceId,
      startTime,
      endTime,
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: GET_TRACE_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, GET_TRACE_API, reqDTO);
    const trace = await resolveOssPayload<TraceEntry>(resp);
    if (!trace || !trace.traceId) {
      throw new BailianError(
        `No trace found for ${flags.traceId} in the selected range.`,
        ExitCode.GENERAL,
        "Widen the window with --hours/--start-time, or check the trace ID.",
      );
    }

    if (format === "json") {
      emitResult(trace, format);
      return;
    }

    const color = ansi(process.stdout);
    process.stdout.write(
      `${color.bold("Trace")} ${trace.traceId}  ${color.dim(formatDateTime(trace.startTime))}\n\n`,
    );
    printSpan(trace, 0);
  },
});
