import {
  BailianError,
  ExitCode,
  detectOutputFormat,
  effectiveConsoleGatewayConfig,
  type Client,
  type FlagsDef,
} from "bailian-cli-core";
import { ansi, emitResult, renderBoxTable } from "bailian-cli-runtime";
import { formatNumber, formatDateTime } from "../shared/format.ts";
import { parseCommaList } from "../shared/params.ts";
import {
  buildGroupSwitchReqDTO,
  ensureTelemetryRegionSupported,
  ensureTelemetrySlrAuthorized,
  ENABLE_GROUP_API,
  DISABLE_GROUP_API,
  getTelemetryGroupSwitch,
  getTelemetryServiceStatus,
  pollTelemetryData,
  unwrapConsolePrimitive,
} from "../shared/telemetry.ts";
import type { Settings } from "bailian-cli-core";

// ---------------------------------------------------------------------------
// Log query types (shared by audit / inference list & get)
// ---------------------------------------------------------------------------

export interface ModelLogEntry {
  modelRequestId: string;
  model: string;
  apiKey?: string;
  apikeyId?: string;
  request?: string;
  response?: string;
  startTime: number;
  callDuration: number;
  httpStatusCode: number;
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

export function printLogTable(list: ModelLogEntry[]): void {
  const color = ansi(process.stdout);

  if (list.length === 0) {
    process.stdout.write("No logs found in this range.\n");
    return;
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
        formatDateTime(entry.startTime),
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
  for (const line of lines) process.stdout.write(line + "\n");
}

export function printLogDetail(entry: ModelLogEntry): void {
  const color = ansi(process.stdout);
  const usage = parseLogUsage(entry.usage);

  const rows: [string, string][] = [
    ["Request ID", entry.modelRequestId],
    ["Model", entry.model ?? "-"],
    ["Time", entry.startTime ? formatDateTime(entry.startTime) : "-"],
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
    process.stdout.write(`${color.bold(label)}: ${value}\n`);
  }
  if (entry.request) {
    process.stdout.write(`\n${color.bold("Request:")}\n${entry.request}\n`);
  }
  if (entry.response) {
    process.stdout.write(`\n${color.bold("Response:")}\n${entry.response}\n`);
  }
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
  client: Client;
  settings: Settings;
  binName: string;
  format: "json" | "text";
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
  const { client, settings, format } = ctx;
  const color = ansi(process.stderr);

  if (settings.dryRun) {
    emitResult(
      {
        apis: [CREATE_SLR_API, INIT_STORE_API, ENABLE_GROUP_API],
        data: { reqDTO: groupReqDTO(settings, kind) },
        ...effectiveConsoleGatewayConfig(settings),
      },
      format,
    );
    return;
  }

  ensureTelemetryRegionSupported(settings);

  // Step 1: SLS service-linked role.
  await ensureTelemetrySlrAuthorized(client, "Log", settings.workspaceId, {
    pollRetries: 5,
    onProgress: (message) => process.stderr.write(color.dim(message + "\n")),
  });

  // Step 2: SLS store instance (async creation, poll until Ready).
  let serviceStatus = await getTelemetryServiceStatus(client, serviceType, settings.workspaceId);
  if (serviceStatus.instanceStatus === "NotExist") {
    process.stderr.write(color.dim("Initializing the SLS store instance...\n"));
    await pollTelemetryData(client, INIT_STORE_API, {
      ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
      serviceType,
    });

    if (!ctx.noWait) {
      process.stderr.write(color.dim("Waiting for the SLS instance to become ready...\n"));
      const deadline = Date.now() + WAIT_TIMEOUT_MS;
      while (Date.now() < deadline && serviceStatus.instanceStatus !== "Ready") {
        await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
        serviceStatus = await getTelemetryServiceStatus(client, serviceType, settings.workspaceId);
      }
    }
  }

  // Step 3: flip the delivery switch for every model in the workspace.
  await client.console(ENABLE_GROUP_API, { reqDTO: groupReqDTO(settings, kind) });

  if (format === "json") {
    emitResult({ enabled: true, kind, instanceStatus: serviceStatus.instanceStatus }, format);
    return;
  }

  process.stdout.write(`${kind === "audit" ? "Audit" : "Inference"} log delivery enabled.\n`);
  if (ctx.noWait) {
    process.stdout.write(
      `The SLS instance may still be initializing; check \`${ctx.binName} log status\` later.\n`,
    );
  }
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
  const { client, settings, format } = ctx;

  if (settings.dryRun) {
    emitResult(
      {
        api: DISABLE_GROUP_API,
        data: { reqDTO: groupReqDTO(settings, kind) },
        ...effectiveConsoleGatewayConfig(settings),
      },
      format,
    );
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

  if (format === "json") {
    emitResult({ disabled: true, kind }, format);
    return;
  }

  process.stdout.write(`${kind === "audit" ? "Audit" : "Inference"} log delivery disabled.\n`);
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

export const COUNT_LOGS_API = "zeldaEasy.bailian-telemetry.model.countModelLogs";

export interface LogCountFlags {
  hours?: number;
  startTime?: string;
  endTime?: string;
  model?: string;
  apiKeyId?: string;
}

/** Count logs in a range for one log kind (the API takes a telemetryType). */
export async function countLogs(
  ctx: { client: Client; settings: Settings },
  kind: LogKind,
  flags: LogCountFlags,
  resolveRange: () => { startTime: number; endTime: number },
): Promise<void> {
  const { settings } = ctx;
  const format = detectOutputFormat(settings.output);
  const { startTime, endTime } = resolveRange();

  const reqDTO: Record<string, unknown> = {
    ...(settings.workspaceId
      ? { workspaceId: settings.workspaceId, filterWorkspaceId: settings.workspaceId }
      : {}),
    startTime,
    endTime,
    telemetryType: LOG_GROUP_TYPES[kind],
    models: flags.model ? parseCommaList(flags.model) : undefined,
    apikeyIds: flags.apiKeyId ? parseCommaList(flags.apiKeyId) : undefined,
  };

  if (settings.dryRun) {
    emitResult(
      {
        api: COUNT_LOGS_API,
        data: { reqDTO },
        ...effectiveConsoleGatewayConfig(settings),
      },
      format,
    );
    return;
  }

  ensureTelemetryRegionSupported(settings);

  const raw = await ctx.client.console(COUNT_LOGS_API, { reqDTO });
  const count = unwrapConsolePrimitive<number>(raw);

  if (format === "json") {
    emitResult(
      {
        kind,
        period: { start: formatDateTime(startTime), end: formatDateTime(endTime) },
        count,
      },
      format,
    );
    return;
  }

  process.stdout.write(
    `${kind === "audit" ? "Audit" : "Inference"} logs: ${formatNumber(count)}  (${formatDateTime(startTime)} ~ ${formatDateTime(endTime)})\n`,
  );
}
