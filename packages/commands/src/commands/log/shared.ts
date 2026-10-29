import {
  BailianError,
  ExitCode,
  type Client,
  type CommandOutput,
  type CommandContext,
  type FlagsDef,
  type LocalizedText,
} from "bailian-cli-core";
import { ansi, renderBoxTable } from "bailian-cli-runtime";
import { formatNumber, formatDateTime } from "../shared/format.ts";
import { parseCommaList } from "../shared/params.ts";
import {
  telemetryGatewayPreview,
  buildGroupSwitchReqDTO,
  ensureTelemetryRegionSupported,
  ensureTelemetrySlrAuthorized,
  ENABLE_GROUP_API,
  DISABLE_GROUP_API,
  getTelemetryGroupSwitch,
  getTelemetryServiceStatus,
  pollTelemetryData,
} from "../shared/telemetry.ts";
import type { Settings } from "bailian-cli-core";

// ---------------------------------------------------------------------------
// Log query types (shared by audit / inference list & get)
// ---------------------------------------------------------------------------

export interface ModelLogEntry {
  modelRequestId?: string;
  model?: string;
  workspaceId?: string;
  apiKey?: string;
  apikeyId?: string;
  request?: string;
  response?: string;
  startTime?: number;
  callDuration?: number;
  httpStatusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  firstTokenDuration?: number;
  usage?: { input_tokens?: string; output_tokens?: string; total_tokens?: string } | string;
  channel?: string;
  source?: string;
  /** Async-task correlation id echoed on some rows; needed to fetch origin logs. */
  taskUuid?: string;
  /** Raw audit record attached to platform-model rows (audit detail view). */
  originLog?: Record<string, unknown>;
}

function auditNumber(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function auditString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 审计接口把调用元数据放在 originLog；保留原始记录及已有的规范化字段。 */
export function normalizeAuditLog(entry: ModelLogEntry): ModelLogEntry {
  const origin = entry.originLog ?? {};
  const usage = entry.usage ?? origin.usage;
  return {
    ...entry,
    modelRequestId: entry.modelRequestId ?? auditString(origin.request_id),
    model: entry.model ?? auditString(origin.model),
    workspaceId: entry.workspaceId ?? auditString(origin.workspace_id),
    apikeyId: entry.apikeyId ?? auditString(origin.apikey_id),
    startTime: auditNumber(entry.startTime ?? origin.start_unix_timestamp),
    callDuration: auditNumber(entry.callDuration ?? origin.duration),
    httpStatusCode: auditNumber(entry.httpStatusCode ?? origin.status_code),
    usage:
      typeof usage === "string" || (usage && typeof usage === "object" && !Array.isArray(usage))
        ? (usage as ModelLogEntry["usage"])
        : undefined,
  };
}

/** 空间与查询身份是独立维度；拒绝把其他空间的数据当作过滤结果输出。 */
export function assertAuditWorkspace(
  list: ModelLogEntry[],
  ctx: Pick<CommandContext, "settings" | "localize">,
): void {
  const workspaceId = ctx.settings.workspaceId;
  if (!workspaceId || !list.some((entry) => entry.workspaceId !== workspaceId)) return;
  throw new BailianError(
    ctx.localize({
      "en-US": "Audit log results do not match the requested workspace.",
      "zh-CN": "审计日志结果与请求的工作空间不一致。",
    }),
    ExitCode.GENERAL,
    ctx.localize({
      "en-US":
        "The query identity was resolved from --workspace-id, but the returned records do not match. Check the workspace mapping and console response; no mismatched records were output.",
      "zh-CN":
        "已根据 --workspace-id 解析查询身份，但返回记录仍不匹配。请检查空间映射与控制台响应；未输出空间不一致的记录。",
    }),
  );
}

/** usage arrives as a JSON string on some paths, an object on others. */
export function parseLogUsage(usage: ModelLogEntry["usage"]): {
  input_tokens?: string;
  output_tokens?: string;
  total_tokens?: string;
} {
  if (!usage) return {};
  if (typeof usage === "string") {
    try {
      return JSON.parse(usage) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return usage;
}

export const STATUS_CODE_TYPES = ["SUCCESS", "CLIENT_ERROR", "SERVER_ERROR", "CANCEL"] as const;

export function validateStatusCodeTypes(statusCode: string | undefined): string | undefined {
  if (!statusCode) return undefined;
  const unknown = parseCommaList(statusCode).filter(
    (item) => !(STATUS_CODE_TYPES as readonly string[]).includes(item),
  );
  if (unknown.length > 0) {
    return `Unknown status code type: ${unknown.join(", ")}. Valid: ${STATUS_CODE_TYPES.join(", ")}.`;
  }
  return undefined;
}

/** Request IDs are UUID-shaped; the gateway accepts 32-36 chars. */
export const REQUEST_ID_LENGTH = { min: 32, max: 36 };

export function validateRequestIdLength(requestId: string): string | undefined {
  const length = requestId.length;
  if (length < REQUEST_ID_LENGTH.min || length > REQUEST_ID_LENGTH.max) {
    return `--request-id must be ${REQUEST_ID_LENGTH.min}-${REQUEST_ID_LENGTH.max} characters.`;
  }
  return undefined;
}

export function renderLogTable(list: ModelLogEntry[]): string {
  const textChunks: string[] = [];

  const color = ansi(process.stdout);

  if (list.length === 0) {
    textChunks.push("No logs found in this range.\n");
    return textChunks.join("").replace(/\n$/, "");
  }

  const lines = renderBoxTable({
    headers: ["Time", "Request ID", "Model", "Status", "Duration", "First Token", "Tokens"],
    rows: list.map((entry) => {
      const usage = parseLogUsage(entry.usage);
      const tokens =
        usage.input_tokens != null || usage.output_tokens != null
          ? `${usage.input_tokens ?? "-"}/${usage.output_tokens ?? "-"}`
          : "-";
      return [
        entry.startTime != null && !Number.isNaN(new Date(entry.startTime).getTime())
          ? formatDateTime(entry.startTime)
          : "-",
        entry.modelRequestId ?? "-",
        entry.model ?? "-",
        entry.httpStatusCode != null ? String(entry.httpStatusCode) : "-",
        entry.callDuration != null ? `${formatNumber(entry.callDuration)} ms` : "-",
        entry.firstTokenDuration != null ? `${formatNumber(entry.firstTokenDuration)} ms` : "-",
        tokens,
      ];
    }),
    align: ["left", "left", "left", "right", "right", "right", "right"],
    cellColor: (_rowIndex, colIndex, value) => {
      if (colIndex !== 3) return undefined;
      if (value.startsWith("2")) return color.green(value);
      if (value.startsWith("5")) return color.red(value);
      if (value === "-") return undefined;
      return color.yellow(value);
    },
  });
  for (const line of lines) textChunks.push(line + "\n");

  return textChunks.join("").replace(/\n$/, "");
}

export function renderLogDetail(entry: ModelLogEntry): string {
  const textChunks: string[] = [];

  const color = ansi(process.stdout);
  const usage = parseLogUsage(entry.usage);

  const rows: [string, string][] = [
    ["Request ID", entry.modelRequestId ?? "-"],
    ["Model", entry.model ?? "-"],
    [
      "Time",
      entry.startTime != null && !Number.isNaN(new Date(entry.startTime).getTime())
        ? formatDateTime(entry.startTime)
        : "-",
    ],
    ["Status", entry.httpStatusCode != null ? String(entry.httpStatusCode) : "-"],
    ["Duration", entry.callDuration != null ? `${entry.callDuration} ms` : "-"],
    ["First Token", entry.firstTokenDuration != null ? `${entry.firstTokenDuration} ms` : "-"],
    [
      "Tokens (in/out/total)",
      `${usage.input_tokens ?? "-"}/${usage.output_tokens ?? "-"}/${usage.total_tokens ?? "-"}`,
    ],
  ];
  if (entry.apikeyId) rows.push(["API Key ID", entry.apikeyId]);
  if (entry.errorCode) rows.push(["Error Code", entry.errorCode]);
  if (entry.errorMessage) rows.push(["Error Message", entry.errorMessage]);

  for (const [label, value] of rows) {
    textChunks.push(`${color.bold(label)}: ${value}\n`);
  }
  if (entry.request) {
    textChunks.push(`\n${color.bold("Request:")}\n${entry.request}\n`);
  }
  if (entry.response) {
    textChunks.push(`\n${color.bold("Response:")}\n${entry.response}\n`);
  }

  return textChunks.join("").replace(/\n$/, "");
}

// ---------------------------------------------------------------------------
// Log delivery switches (telemetry group)
// ---------------------------------------------------------------------------

/** telemetryGroup switch types; distinct from the activate serviceType names. */
export const LOG_GROUP_TYPES = {
  audit: "AuditLog",
  inference: "InferenceLog",
} as const;

export type LogKind = keyof typeof LOG_GROUP_TYPES;

const CREATE_SLR_API = "zeldaEasy.bailian-telemetry.activate.createTelemetrySlr";
const INIT_STORE_API = "zeldaEasy.bailian-telemetry.activate.initTelemetryStoreInstance";

const WAIT_INTERVAL_MS = 3000;
const WAIT_TIMEOUT_MS = 180_000;

/**
 * Read the delivery switch of one log kind. The audit/inference kinds map
 * onto group telemetryType names distinct from the activate serviceType names.
 */
export async function getLogSwitch(
  client: Client,
  kind: LogKind,
  workspaceId?: string,
): Promise<boolean | null> {
  return getTelemetryGroupSwitch(client, LOG_GROUP_TYPES[kind], workspaceId);
}

/**
 * Inference log delivery builds on the audit log; gate it like the console
 * does. The switch state can lag a few seconds right after `log audit enable`
 * returns, so retry briefly before declaring the audit log off.
 */
export async function requireAuditLogEnabled(
  client: Client,
  workspaceId: string | undefined,
  binName: string,
): Promise<void> {
  let auditSwitch = await getLogSwitch(client, "audit", workspaceId);
  for (let attempt = 0; attempt < 3 && auditSwitch !== true; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    auditSwitch = await getLogSwitch(client, "audit", workspaceId);
  }
  if (auditSwitch === true) return;
  throw new BailianError(
    "Model audit log is not enabled yet.",
    ExitCode.USAGE,
    `Inference log delivery requires the audit log. Run \`${binName} log audit enable\` first, then check \`${binName} log status\`.`,
  );
}

function groupReqDTO(settings: Settings, kind: LogKind): Record<string, unknown> {
  return buildGroupSwitchReqDTO(settings, LOG_GROUP_TYPES[kind]);
}

// ---------------------------------------------------------------------------
// Enable / disable orchestration
// ---------------------------------------------------------------------------

export interface LogEnableContext {
  output: CommandOutput;
  client: Client;
  settings: Settings;
  binName: string;
  noWait?: boolean;
}

/**
 * Enable one log delivery switch, mirroring the console flow:
 * 1) authorize the SLS service-linked role, 2) initialize the SLS store
 * instance when missing (async), 3) flip the telemetry group switch.
 */
export async function enableLogDelivery(
  ctx: LogEnableContext,
  kind: LogKind,
  serviceType: string,
): Promise<void> {
  const { client, settings } = ctx;
  const format = settings.output;

  if (settings.dryRun) {
    ctx.output.result({
      apis: [CREATE_SLR_API, INIT_STORE_API, ENABLE_GROUP_API],
      data: { reqDTO: groupReqDTO(settings, kind) },
      ...telemetryGatewayPreview(settings),
    });
    return;
  }

  ensureTelemetryRegionSupported(settings);

  // Step 1: SLS service-linked role.
  await ensureTelemetrySlrAuthorized(client, "Log", settings.workspaceId, {
    pollRetries: 5,
    onProgress: (message) =>
      ctx.output.progress({ "en-US": message, "zh-CN": "正在授权服务关联角色……" }),
  });

  // Step 2: SLS store instance (async creation, poll until Ready).
  let serviceStatus = await getTelemetryServiceStatus(client, serviceType, settings.workspaceId);
  if (serviceStatus.instanceStatus === "NotExist") {
    ctx.output.info({
      "en-US": "Initializing the SLS store instance...",
      "zh-CN": "正在初始化 SLS 存储实例……",
    });
    await pollTelemetryData(client, INIT_STORE_API, {
      ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
      serviceType,
    });

    if (!ctx.noWait) {
      ctx.output.info({
        "en-US": "Waiting for the SLS instance to become ready...",
        "zh-CN": "正在等待 SLS 实例就绪……",
      });
      const deadline = Date.now() + WAIT_TIMEOUT_MS;
      while (Date.now() < deadline && serviceStatus.instanceStatus !== "Ready") {
        await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
        serviceStatus = await getTelemetryServiceStatus(client, serviceType, settings.workspaceId);
      }
    }
  }

  // Step 3: flip the delivery switch for every model in the workspace.
  await client.console(ENABLE_GROUP_API, { reqDTO: groupReqDTO(settings, kind) });

  let text: string | undefined;
  if (format === "text") {
    const textChunks: string[] = [];

    textChunks.push(`${kind === "audit" ? "Audit" : "Inference"} log delivery enabled.\n`);
    if (ctx.noWait) {
      textChunks.push(
        `The SLS instance may still be initializing; check \`${ctx.binName} log status\` later.\n`,
      );
    }

    text = textChunks.join("").replace(/\n$/, "");
  }
  ctx.output.result(
    { enabled: true, kind, instanceStatus: serviceStatus.instanceStatus },
    { text },
  );
}

/**
 * Disable one log delivery switch. The console refuses to turn off the audit
 * log while inference is still on — enforce the same rule client-side.
 */
export async function disableLogDelivery(
  ctx: LogEnableContext,
  kind: LogKind,
  guardInferenceOn?: boolean,
): Promise<void> {
  const { client, settings } = ctx;
  const format = settings.output;

  if (settings.dryRun) {
    ctx.output.result({
      api: DISABLE_GROUP_API,
      data: { reqDTO: groupReqDTO(settings, kind) },
      ...telemetryGatewayPreview(settings),
    });
    return;
  }

  ensureTelemetryRegionSupported(settings);

  if (guardInferenceOn) {
    const inferenceSwitch = await getLogSwitch(client, "inference", settings.workspaceId);
    if (inferenceSwitch === true) {
      throw new BailianError(
        "The audit log cannot be disabled while the inference log is enabled.",
        ExitCode.USAGE,
        `Run \`${ctx.binName} log inference disable\` first, then disable the audit log.`,
      );
    }
  }

  await client.console(DISABLE_GROUP_API, { reqDTO: groupReqDTO(settings, kind) });

  let text: string | undefined;
  if (format === "text") {
    const textChunks: string[] = [];

    textChunks.push(`${kind === "audit" ? "Audit" : "Inference"} log delivery disabled.\n`);

    text = textChunks.join("").replace(/\n$/, "");
  }
  ctx.output.result({ disabled: true, kind }, { text });
}

/** Shared --no-wait flag used by both enable commands. */
export const LOG_NO_WAIT_FLAG = {
  noWait: {
    type: "switch",
    description: {
      "en-US": "Return right after submitting, without waiting for the SLS instance",
      "zh-CN": "提交后立即返回，不等待 SLS 实例就绪",
    },
  },
} satisfies FlagsDef;

export function validateHoursFlag(hours: number | undefined): string | undefined {
  if (hours != null && hours <= 0) return "--hours must be positive.";
  return undefined;
}

// ---------------------------------------------------------------------------
// Log count (shared by audit / inference)
// ---------------------------------------------------------------------------

export const LIST_AUDIT_LOGS_API = "zeldaEasy.bailian-telemetry.platform-model.listModelLogs";
export const LIST_INFERENCE_LOGS_API = "zeldaEasy.bailian-telemetry.model.listModelLogs";

export interface LogCountFlags {
  hours?: number;
  startTime?: string;
  endTime?: string;
  model?: string;
  apiKeyId?: string;
}

export function validateInferenceCountFlags(flags: LogCountFlags): LocalizedText | undefined {
  const hoursError = validateHoursFlag(flags.hours);
  if (hoursError) return hoursError;
  for (const [flagName, value] of [
    ["--model", flags.model],
    ["--api-key-id", flags.apiKeyId],
  ] as const) {
    if (value !== undefined && parseCommaList(value).length === 0) {
      return {
        "en-US": `${flagName} must contain at least one non-empty value.`,
        "zh-CN": `${flagName} 必须包含至少一个非空值。`,
      };
    }
  }
  return undefined;
}

/** 两类日志各用自己的列表 totalCount，避免独立计数接口与列表的口径错配。 */
export async function countLogs(
  ctx: Pick<CommandContext, "client" | "settings" | "localize" | "output">,
  kind: LogKind,
  flags: LogCountFlags,
  resolveRange: () => { startTime: number; endTime: number },
): Promise<void> {
  const { settings } = ctx;
  const format = settings.output;
  const { startTime, endTime } = resolveRange();
  const api = kind === "audit" ? LIST_AUDIT_LOGS_API : LIST_INFERENCE_LOGS_API;
  const baseReqDTO: Record<string, unknown> = {
    ...(settings.workspaceId
      ? { workspaceId: settings.workspaceId, filterWorkspaceId: settings.workspaceId }
      : {}),
    startTime: kind === "audit" ? startTime : String(startTime),
    endTime: kind === "audit" ? endTime : String(endTime),
    maxResults: 1,
    skip: 0,
    needFullContent: false,
  };
  let reqDTOs: Record<string, unknown>[];
  if (kind === "audit") {
    reqDTOs = [
      {
        ...baseReqDTO,
        models: flags.model ? parseCommaList(flags.model) : undefined,
        apikeyIds: flags.apiKeyId ? parseCommaList(flags.apiKeyId) : undefined,
      },
    ];
  } else {
    const validationError = validateInferenceCountFlags(flags);
    if (validationError) throw new BailianError(ctx.localize(validationError), ExitCode.USAGE);
    const models = flags.model !== undefined ? parseCommaList(flags.model) : [undefined];
    const apiKeyIds = flags.apiKeyId !== undefined ? parseCommaList(flags.apiKeyId) : [undefined];
    // 推理列表只接受单值；模型与 Key 去重后的组合互不重叠，逐组合取总数再汇总。
    reqDTOs = models.flatMap((model) =>
      apiKeyIds.map((apikeyId) => ({
        ...baseReqDTO,
        model,
        apikeyId,
      })),
    );
  }

  if (settings.dryRun) {
    ctx.output.result({
      api,
      data: reqDTOs.length === 1 ? { reqDTO: reqDTOs[0] } : { reqDTOs },
      ...telemetryGatewayPreview(settings),
    });
    return;
  }

  ensureTelemetryRegionSupported(settings);

  let count = 0;
  for (const reqDTO of reqDTOs) {
    // 每个组合只取一条元数据；不统计页长度、不遍历分页，也不回捞完整日志。
    const response = await pollTelemetryData(ctx.client, api, reqDTO);
    const totalCount = response?.totalCount;
    if (
      typeof totalCount !== "number" ||
      !Number.isSafeInteger(totalCount) ||
      totalCount < 0 ||
      !Number.isSafeInteger(count + totalCount)
    ) {
      throw new BailianError(
        ctx.localize({
          "en-US": "The log count response contains no valid count.",
          "zh-CN": "日志计数响应未包含有效的记录数。",
        }),
        ExitCode.GENERAL,
      );
    }
    if (kind === "audit" && Array.isArray(response?.list)) {
      assertAuditWorkspace((response.list as ModelLogEntry[]).map(normalizeAuditLog), ctx);
    }
    count += totalCount;
  }

  let text: string | undefined;
  if (format === "text") {
    const textChunks: string[] = [];

    textChunks.push(
      `${kind === "audit" ? "Audit" : "Inference"} logs: ${formatNumber(count)}  (${formatDateTime(startTime)} ~ ${formatDateTime(endTime)})\n`,
    );

    text = textChunks.join("").replace(/\n$/, "");
  }
  ctx.output.result(
    {
      kind,
      period: { start: formatDateTime(startTime), end: formatDateTime(endTime) },
      count,
    },
    { text },
  );
}
