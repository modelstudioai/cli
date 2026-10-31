import { parseCommaList } from "../shared/params.ts";
import {
  defineTelemetryCommand,
  telemetryGatewayPreview,
  TELEMETRY_LOG_TIME_FLAGS,
  TELEMETRY_FILTER_FLAGS,
  buildTelemetryFilters,
  ensureTelemetryRegionSupported,
  pollTelemetryData,
  resolveTimeRange,
} from "../shared/telemetry.ts";
import {
  type ModelLogEntry,
  LIST_AUDIT_LOGS_API,
  normalizeAuditLog,
  assertAuditWorkspace,
  renderLogTable,
  validateHoursFlag,
  validateStatusCodeTypes,
} from "./shared.ts";

export { LIST_AUDIT_LOGS_API } from "./shared.ts";

export default defineTelemetryCommand({
  description: {
    "en-US": "Query model audit logs (call metadata; request/response content is not recorded)",
    "zh-CN": "查询模型审计日志（调用元数据；不含请求/响应内容）",
  },
  auth: "console",
  usageArgs: "[--model <model>] [--hours <n>] [flags]",
  flags: {
    ...TELEMETRY_LOG_TIME_FLAGS,
    ...TELEMETRY_FILTER_FLAGS,
    requestId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Exact model request ID",
        "zh-CN": "精确匹配模型请求 ID",
      },
    },
    statusCode: {
      type: "string",
      valueHint: "<type>",
      description: {
        "en-US": "Status filter(s), comma-separated: SUCCESS, CLIENT_ERROR, SERVER_ERROR, CANCEL",
        "zh-CN": "状态过滤，多个以逗号分隔：SUCCESS、CLIENT_ERROR、SERVER_ERROR、CANCEL",
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
    nextToken: {
      type: "string",
      valueHint: "<token>",
      description: {
        "en-US": "Pagination token from a previous response",
        "zh-CN": "上一次响应返回的分页标记",
      },
    },
  },
  exampleArgs: [
    "",
    "--model qwen3.6-plus --hours 3",
    "--workspace-id ws-example --hours 144",
    "--status-code SERVER_ERROR,CLIENT_ERROR",
    "--request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "--output json",
  ],
  notes: [
    {
      "en-US":
        "Audit logs carry call metadata only. For full request/response content, enable and query the inference log (`log inference list` / `log inference get`).",
      "zh-CN":
        "审计日志只记录调用元数据。需要完整请求/响应内容时，请开启并查询推理日志（`log inference list` / `log inference get`）。",
    },
    {
      "en-US": "Use --call-source Online to match the console's online inference filter.",
      "zh-CN": "使用 --call-source Online 对齐控制台的在线推理过滤。",
    },
  ],
  validate: (flags) => {
    return validateStatusCodeTypes(flags.statusCode) ?? validateHoursFlag(flags.hours);
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.output;
    const { startTime, endTime } = resolveTimeRange(flags, 1 / 24);

    const reqDTO: Record<string, unknown> = {
      ...buildTelemetryFilters(flags, settings.workspaceId),
      filterWorkspaceId: settings.workspaceId,
      startTime,
      endTime,
      maxResults: flags.maxResults ?? 20,
      skip: flags.skip ?? 0,
      nextToken: flags.nextToken,
      modelRequestId: flags.requestId,
      needFullContent: false,
      statusCodeTypes: flags.statusCode ? parseCommaList(flags.statusCode) : undefined,
    };

    if (settings.dryRun) {
      ctx.output.result({
        api: LIST_AUDIT_LOGS_API,
        data: { reqDTO },
        ...telemetryGatewayPreview(settings),
      });
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, LIST_AUDIT_LOGS_API, reqDTO);
    const list = ((resp.list as ModelLogEntry[]) ?? []).map(normalizeAuditLog);
    assertAuditWorkspace(list, ctx);
    const nextToken = resp.nextToken as string | undefined;

    let text: string | undefined;
    if (format === "text") {
      const textChunks: string[] = [];

      textChunks.push(renderLogTable(list) + "\n");
      if (nextToken) {
        textChunks.push(`Next page: --next-token ${nextToken}\n`);
      }

      text = textChunks.join("").replace(/\n$/, "");
    }
    ctx.output.result(
      {
        totalCount: resp.totalCount ?? 0,
        nextToken,
        list,
      },
      { text },
    );
  },
});
