import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { parseCommaList } from "../shared/params.ts";
import {
  TELEMETRY_LOG_TIME_FLAGS,
  ensureTelemetryRegionSupported,
  pollTelemetryData,
  resolveTimeRange,
} from "../shared/telemetry.ts";
import {
  type ModelLogEntry,
  printLogTable,
  validateHoursFlag,
  validateStatusCodeTypes,
} from "./shared.ts";

export const LIST_INFERENCE_LOGS_API = "zeldaEasy.bailian-telemetry.model.listModelLogs";

const STATUS_CODE_TYPES = ["SUCCESS", "CLIENT_ERROR", "SERVER_ERROR", "CANCEL"] as const;

export default defineCommand({
  description: {
    "en-US":
      "Query model inference logs (requires inference log delivery; use `log inference get` for request/response content)",
    "zh-CN": "查询模型推理日志（需已开启推理日志投递；请求/响应内容请用 `log inference get` 查看）",
  },
  auth: "console",
  usageArgs: "[--model <model>] [--hours <n>] [flags]",
  flags: {
    ...TELEMETRY_LOG_TIME_FLAGS,
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Model name (the inference log API accepts a single model)",
        "zh-CN": "模型名称（推理日志接口仅支持单个模型）",
      },
    },
    apiKeyId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "API key ID (the inference log API accepts a single ID)",
        "zh-CN": "API Key ID（推理日志接口仅支持单个 ID）",
      },
    },
    callSource: {
      type: "string",
      valueHint: "<type>",
      choices: ["Online", "Offline"] as const,
      description: {
        "en-US": "Inference type: Online, Offline",
        "zh-CN": "推理类型：Online、Offline",
      },
    },
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
        "en-US": `Status filter(s), comma-separated: ${STATUS_CODE_TYPES.join(", ")}`,
        "zh-CN": `状态过滤，多个以逗号分隔：${STATUS_CODE_TYPES.join("、")}`,
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
    "",
    "--model qwen3.6-plus --hours 3",
    "--status-code SERVER_ERROR,CLIENT_ERROR",
    "--request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "--output json",
  ],
  notes: [
    {
      "en-US":
        "Requires inference log delivery (`log inference enable`), which itself requires the audit log. Entries here mirror the audit trail; full request/response content is fetched per request via `log inference get`.",
      "zh-CN":
        "需先开启推理日志投递（`log inference enable`），且推理日志依赖审计日志。列表与审计口径同构；完整请求/响应内容按请求 ID 通过 `log inference get` 回捞。",
    },
  ],
  validate: (flags) => {
    return validateStatusCodeTypes(flags.statusCode) ?? validateHoursFlag(flags.hours);
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const { startTime, endTime } = resolveTimeRange(flags, 1 / 24);

    // The inference log API takes single model/apikey values and string timestamps.
    const reqDTO: Record<string, unknown> = {
      ...(settings.workspaceId
        ? { workspaceId: settings.workspaceId, filterWorkspaceId: settings.workspaceId }
        : {}),
      startTime: String(startTime),
      endTime: String(endTime),
      model: flags.model,
      apikeyId: flags.apiKeyId,
      modelCallSource: flags.callSource,
      modelRequestId: flags.requestId,
      maxResults: flags.maxResults ?? 20,
      skip: flags.skip ?? 0,
      needFullContent: false,
      statusCodeTypes: flags.statusCode ? parseCommaList(flags.statusCode) : undefined,
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: LIST_INFERENCE_LOGS_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, LIST_INFERENCE_LOGS_API, reqDTO);
    const list = (resp.list as ModelLogEntry[]) ?? [];

    if (format === "json") {
      emitResult(
        {
          totalCount: resp.totalCount ?? 0,
          list,
        },
        format,
      );
      return;
    }

    printLogTable(list);
  },
});
