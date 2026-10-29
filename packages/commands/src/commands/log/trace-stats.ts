import { defineTelemetryCommand, telemetryGatewayPreview } from "../shared/telemetry.ts";
import { renderBoxTable } from "bailian-cli-runtime";
import { formatNumber, formatDateTime } from "../shared/format.ts";
import { parseCommaList } from "../shared/params.ts";
import {
  TELEMETRY_LOG_TIME_FLAGS,
  ensureTelemetryRegionSupported,
  pollTelemetryData,
  resolveTimeRange,
} from "../shared/telemetry.ts";

const TRACE_STATISTIC_API = "zeldaEasy.bailian-telemetry.trace.getTraceStatistic";

interface TraceStatistic {
  resourceId: string;
  resourceType: string;
  resourceCount?: string | null;
  callCount?: string;
  totalTokens?: string;
  avgDuration?: string;
  avgFirstPacketLatency?: string;
  avgLlmFirstTokenDuration?: string;
  avgUserFirstTokenDuration?: string;
}

function renderStatistics(items: TraceStatistic[]): string {
  const textChunks: string[] = [];

  if (items.length === 0) {
    textChunks.push("No trace statistics found in this range.\n");
    return textChunks.join("").replace(/\n$/, "");
  }

  const lines = renderBoxTable({
    headers: ["Resource", "Calls", "Total Tokens", "Avg Duration", "Avg First Token"],
    rows: items.map((item) => [
      item.resourceId ?? "-",
      formatNumber(Number(item.callCount ?? 0)),
      formatNumber(Number(item.totalTokens ?? 0)),
      item.avgDuration ? `${formatNumber(Math.round(Number(item.avgDuration)))} ms` : "-",
      item.avgLlmFirstTokenDuration
        ? `${formatNumber(Math.round(Number(item.avgLlmFirstTokenDuration)))} ms`
        : "-",
    ]),
    align: ["left", "right", "right", "right", "right"],
  });
  for (const line of lines) textChunks.push(line + "\n");

  return textChunks.join("").replace(/\n$/, "");
}

export default defineTelemetryCommand({
  description: {
    "en-US": "Show per-resource trace statistics (calls, tokens, latency)",
    "zh-CN": "查看调用链维度统计（调用量、Token、延迟）",
  },
  auth: "console",
  usageArgs: "[--resource-id <id>] [flags]",
  flags: {
    ...TELEMETRY_LOG_TIME_FLAGS,
    resourceId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Model name(s) or app ID(s), comma-separated; omit for all",
        "zh-CN": "模型名称或应用 ID，多个以逗号分隔；省略表示全部",
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
  },
  exampleArgs: ["", "--resource-id qwen3.6-plus --hours 24", "--resource-type app --output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.output;
    const { startTime, endTime } = resolveTimeRange(flags, 1 / 24);

    const reqDTO = {
      ...(settings.workspaceId
        ? { workspaceId: settings.workspaceId, filterWorkspaceId: settings.workspaceId }
        : {}),
      resourceIdList: flags.resourceId ? parseCommaList(flags.resourceId) : undefined,
      resourceType: flags.resourceType ?? "model",
      startTime,
      endTime,
    };

    if (settings.dryRun) {
      ctx.output.result({
        api: TRACE_STATISTIC_API,
        data: { reqDTO },
        ...telemetryGatewayPreview(settings),
      });
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, TRACE_STATISTIC_API, reqDTO);
    // Keyed by resource id.
    const items = Object.values(resp) as TraceStatistic[];

    let text: string | undefined;
    if (format === "text") {
      const textChunks: string[] = [];

      textChunks.push(renderStatistics(items) + "\n");

      text = textChunks.join("").replace(/\n$/, "");
    }
    ctx.output.result(
      {
        period: { start: formatDateTime(startTime), end: formatDateTime(endTime) },
        list: items,
      },
      { text },
    );
  },
});
