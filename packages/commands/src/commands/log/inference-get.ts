import {
  defineCommand,
  BailianError,
  ExitCode,
  detectOutputFormat,
  effectiveConsoleGatewayConfig,
} from "bailian-cli-core";
import { ansi, emitResult } from "bailian-cli-runtime";
import {
  TELEMETRY_LOG_TIME_FLAGS,
  ensureTelemetryRegionSupported,
  pollTelemetryData,
  resolveTimeRange,
} from "../shared/telemetry.ts";
import {
  type ModelLogEntry,
  printLogDetail,
  validateHoursFlag,
  validateRequestIdLength,
} from "./shared.ts";
import { LIST_INFERENCE_LOGS_API } from "./inference-list.ts";

const ORIGIN_LOG_API = "zeldaEasy.bailian-telemetry.model.getModelOriginLog";

export default defineCommand({
  description: {
    "en-US": "Show a single inference log entry with full request/response content",
    "zh-CN": "查看单条推理日志详情（含完整请求/响应内容）",
  },
  auth: "console",
  usageArgs: "--request-id <id> [flags]",
  flags: {
    ...TELEMETRY_LOG_TIME_FLAGS,
    requestId: {
      type: "string",
      valueHint: "<id>",
      required: true,
      description: {
        "en-US": "Model request ID (from `log inference list`)",
        "zh-CN": "模型请求 ID（可由 log inference list 获得）",
      },
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Model name (narrows the search)",
        "zh-CN": "模型名称（缩小查询范围）",
      },
    },
  },
  exampleArgs: [
    "--request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "--request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx --hours 24",
    "--request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx --output json",
  ],
  notes: [
    {
      "en-US":
        "The origin content is fetched back by request ID from the inference log store, so inference log delivery must have been enabled when the call happened.",
      "zh-CN": "原始内容按请求 ID 从推理日志存储回捞，因此调用发生时须已开启推理日志投递。",
    },
  ],
  validate: (flags) => {
    return validateRequestIdLength(flags.requestId) ?? validateHoursFlag(flags.hours);
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    // A single request may sit far back; default window is 24h here.
    const { startTime, endTime } = resolveTimeRange(flags, 1);

    const baseReqDTO: Record<string, unknown> = {
      ...(settings.workspaceId
        ? { workspaceId: settings.workspaceId, filterWorkspaceId: settings.workspaceId }
        : {}),
      modelRequestId: flags.requestId,
    };

    if (settings.dryRun) {
      emitResult(
        {
          apis: [LIST_INFERENCE_LOGS_API, ORIGIN_LOG_API],
          data: {
            reqDTO: { ...baseReqDTO, startTime: String(startTime), endTime: String(endTime) },
          },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, LIST_INFERENCE_LOGS_API, {
      ...baseReqDTO,
      startTime: String(startTime),
      endTime: String(endTime),
      model: flags.model,
      maxResults: 1,
      skip: 0,
      needFullContent: false,
    });
    const entry = ((resp.list as ModelLogEntry[]) ?? [])[0];
    if (!entry) {
      throw new BailianError(
        `No inference log found for request ${flags.requestId} in the selected range.`,
        ExitCode.GENERAL,
        "Widen the window with --hours/--start-time, or check the request ID.",
      );
    }

    // The list API never returns full content; fetch it back by request ID.
    const originResp = await pollTelemetryData(ctx.client, ORIGIN_LOG_API, {
      ...baseReqDTO,
      startTime: String(startTime),
      endTime: String(endTime),
      ...(entry.taskUuid ? { taskUuid: entry.taskUuid } : {}),
    });
    const origin = originResp.originLog as ModelLogEntry | undefined;
    entry.request = entry.request ?? origin?.request;
    entry.response = entry.response ?? origin?.response;

    if (format === "json") {
      emitResult(entry, format);
      return;
    }

    printLogDetail(entry);
    if (!entry.request && !entry.response) {
      process.stdout.write(
        ansi(process.stdout).dim(
          "\nRequest/response content is only available when inference log delivery was enabled at call time.\n",
        ),
      );
    }
  },
});
