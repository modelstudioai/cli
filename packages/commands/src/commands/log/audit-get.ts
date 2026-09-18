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
import { LIST_AUDIT_LOGS_API } from "./audit-list.ts";

export default defineCommand({
  description: {
    "en-US": "Show a single audit log entry with its raw origin record",
    "zh-CN": "查看单条审计日志详情（含原始审计记录）",
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
        "en-US": "Model request ID (from `log audit list`)",
        "zh-CN": "模型请求 ID（可由 log audit list 获得）",
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
        "Audit entries carry call metadata plus the raw audit record; request/response content lives in the inference log (`log inference get`).",
      "zh-CN":
        "审计详情包含调用元数据与原始审计记录；请求/响应内容在推理日志中（`log inference get`）。",
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

    const reqDTO: Record<string, unknown> = {
      ...(settings.workspaceId
        ? { workspaceId: settings.workspaceId, filterWorkspaceId: settings.workspaceId }
        : {}),
      startTime,
      endTime,
      modelRequestId: flags.requestId,
      maxResults: 1,
      skip: 0,
      needFullContent: false,
    };
    if (flags.model) reqDTO.models = [flags.model];

    if (settings.dryRun) {
      emitResult(
        {
          api: LIST_AUDIT_LOGS_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);
    const resp = await pollTelemetryData(ctx.client, LIST_AUDIT_LOGS_API, reqDTO);
    const entry = ((resp.list as ModelLogEntry[]) ?? [])[0];
    if (!entry) {
      throw new BailianError(
        `No audit log found for request ${flags.requestId} in the selected range.`,
        ExitCode.GENERAL,
        "Widen the window with --hours/--start-time, or check the request ID.",
      );
    }

    if (format === "json") {
      emitResult(entry, format);
      return;
    }

    printLogDetail(entry);
    if (entry.originLog) {
      process.stdout.write(
        `\n${ansi(process.stdout).bold("Origin record:")}\n${JSON.stringify(entry.originLog, null, 2)}\n`,
      );
    }
  },
});
