import {
  BailianError,
  ExitCode,
  UsageError,
  effectiveConsoleGatewayConfig,
  unwrapResponse,
  type Client,
  type FlagsDef,
  type Settings,
} from "bailian-cli-core";
import { parseCommaList } from "./params.ts";

// ---------------------------------------------------------------------------
// Async task polling for the console gateway
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 500;
const DEFAULT_MAX_POLLS = 30;

/**
 * Poll a console API until it returns a terminal (non task-id) response.
 * The gateway answers an async request with a bare `{taskId}` envelope; the
 * caller re-issues with that id until real data arrives or the budget runs out.
 */
export async function pollConsoleUntilDone(
  client: Client,
  api: string,
  buildRequest: (taskId: string | undefined) => Record<string, unknown>,
  maxPolls = DEFAULT_MAX_POLLS,
): Promise<unknown> {
  let nextTaskId: string | undefined;

  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const raw = await client.console(api, buildRequest(nextTaskId));
    const resp = unwrapResponse(raw as Record<string, unknown>);

    if (resp.taskId && Object.keys(resp).length === 1) {
      nextTaskId = resp.taskId as string;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }
    return raw;
  }
  return null;
}

/** Telemetry APIs wrap the payload in `reqDTO` and echo the task id as `asyncTaskId`. */
export async function pollTelemetryApi(
  client: Client,
  api: string,
  reqDTO: Record<string, unknown>,
): Promise<unknown> {
  return pollConsoleUntilDone(client, api, (taskId) =>
    taskId ? { reqDTO: { ...reqDTO, asyncTaskId: taskId } } : { reqDTO },
  );
}

/** Poll a telemetry API and unwrap the payload; throws TIMEOUT when the budget runs out. */
export async function pollTelemetryData(
  client: Client,
  api: string,
  reqDTO: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const raw = await pollTelemetryApi(client, api, reqDTO);
  if (!raw) {
    throw new BailianError("Request timed out.", ExitCode.TIMEOUT);
  }
  return unwrapResponse(raw as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Region availability
// ---------------------------------------------------------------------------

/** Console regions where the model telemetry backends (monitor/log/alert) are deployed. */
export const TELEMETRY_SUPPORTED_REGIONS = ["cn-beijing", "ap-southeast-1"] as const;

/**
 * The monitor / log / alert services only exist in a subset of console
 * regions. Fail fast with the supported list instead of letting the request
 * die with an opaque gateway error in a region without the service.
 */
export function ensureTelemetryRegionSupported(settings: Pick<Settings, "consoleRegion">): void {
  const region = effectiveConsoleGatewayConfig(settings).consoleRegion;
  if ((TELEMETRY_SUPPORTED_REGIONS as readonly string[]).includes(region)) return;
  throw new UsageError(
    `Model monitor/log/alert commands are not available in console region "${region}". ` +
      `Supported regions: ${TELEMETRY_SUPPORTED_REGIONS.join(", ")} (set --console-region).`,
  );
}

// ---------------------------------------------------------------------------
// Time range flags
// ---------------------------------------------------------------------------

/** Shared time-range flag definitions for telemetry read commands. */
export const TELEMETRY_TIME_FLAGS = {
  days: {
    type: "number",
    valueHint: "<days>",
    description: {
      "en-US": "Number of days to look back (default: 7)",
      "zh-CN": "向前查询的天数（默认：7）",
    },
  },
  startTime: {
    type: "string",
    valueHint: "<time>",
    description: {
      "en-US": "Range start (ISO date or ms epoch); overrides --days",
      "zh-CN": "开始时间（ISO 日期或毫秒时间戳），设置后覆盖 --days",
    },
  },
  endTime: {
    type: "string",
    valueHint: "<time>",
    description: {
      "en-US": "Range end (ISO date or ms epoch); default: now",
      "zh-CN": "结束时间（ISO 日期或毫秒时间戳），默认当前时间",
    },
  },
} satisfies FlagsDef;

/** Parse a time flag: ms epoch digits, or anything `Date.parse` accepts. */
function parseTimeFlag(value: string, flagName: string): number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new UsageError(`${flagName} must be an ISO date or a millisecond timestamp.`);
  }
  return parsed;
}

export interface TelemetryTimeRange {
  startTime: number;
  endTime: number;
}

/** Resolve --start-time/--end-time/--hours/--days into a millisecond range (end defaults to now). */
export function resolveTimeRange(
  flags: { days?: number; hours?: number; startTime?: string; endTime?: string },
  defaultDays = 7,
): TelemetryTimeRange {
  const endTime = flags.endTime ? parseTimeFlag(flags.endTime, "--end-time") : Date.now();
  const startTime = flags.startTime
    ? parseTimeFlag(flags.startTime, "--start-time")
    : flags.hours != null
      ? endTime - flags.hours * 3_600_000
      : endTime - (flags.days || defaultDays) * 86_400_000;
  if (startTime >= endTime) {
    throw new UsageError("--start-time must be earlier than --end-time.");
  }
  return { startTime, endTime };
}

/** Time flags for log commands: hour-based window, default 1 hour. */
export const TELEMETRY_LOG_TIME_FLAGS = {
  hours: {
    type: "number",
    valueHint: "<hours>",
    description: {
      "en-US": "Hours to look back (default: 1)",
      "zh-CN": "向前查询的小时数（默认：1）",
    },
  },
  startTime: TELEMETRY_TIME_FLAGS.startTime,
  endTime: TELEMETRY_TIME_FLAGS.endTime,
} satisfies FlagsDef;

/** Unwrap a console gateway response whose final payload is a primitive (boolean/number). */
export function unwrapConsolePrimitive<T>(raw: unknown): T {
  const resp = unwrapResponse(raw as Record<string, unknown>) as unknown;
  if (resp !== null && typeof resp === "object" && "result" in (resp as Record<string, unknown>)) {
    return (resp as Record<string, unknown>).result as T;
  }
  return resp as T;
}

/** Steps accepted by the monitor metrics API. */
export const METRIC_STEPS = [60, 3600, 86400] as const;

/** Default step for a range: 60s for short windows, hourly up to 7 days, daily beyond. */
export function autoStep(startTime: number, endTime: number): number {
  const hours = (endTime - startTime) / 3_600_000;
  if (hours <= 12) return 60;
  if (hours <= 7 * 24) return 3600;
  return 86400;
}

// ---------------------------------------------------------------------------
// OSS fallback for large telemetry payloads
// ---------------------------------------------------------------------------

/**
 * `*WithOss` telemetry APIs return small payloads inline as `originData` and
 * large ones as a `dataDownloadUrl`; resolve both shapes to the payload.
 * The payload shape is API-specific (array or wrapper object) — the caller picks T.
 */
export async function resolveOssPayload<T>(resp: Record<string, unknown>): Promise<T | undefined> {
  const { originData, dataDownloadUrl } = resp as {
    originData?: T;
    dataDownloadUrl?: string;
  };
  if (originData !== undefined && originData !== null) return originData;
  if (dataDownloadUrl) {
    const res = await fetch(dataDownloadUrl.replace(/^http:\/\//, "https://"));
    if (!res.ok) {
      throw new BailianError(
        `Failed to download telemetry data (HTTP ${res.status}).`,
        ExitCode.NETWORK,
      );
    }
    return (await res.json()) as T;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Service activation preflight
// ---------------------------------------------------------------------------

export const TELEMETRY_SERVICE_STATUS_API =
  "zeldaEasy.bailian-telemetry.activate.getTelemetryServiceStatus";

export type TelemetryInstanceStatus = "NotExist" | "NotReady" | "Ready";

export interface TelemetryServiceStatus {
  openStatus: boolean;
  instanceStatus?: TelemetryInstanceStatus;
  openServiceUrl?: string;
  instanceInfo?: {
    instanceId: string;
    instanceUrl: string;
    instanceName?: string;
    regionName?: string;
    gmtCreate?: number;
  };
}

/** Query the activation status of a telemetry service (ModelMonitor / ModelLog / …). */
export async function getTelemetryServiceStatus(
  client: Client,
  serviceType: string,
  workspaceId?: string,
): Promise<TelemetryServiceStatus> {
  const resp = await pollTelemetryData(client, TELEMETRY_SERVICE_STATUS_API, {
    ...(workspaceId ? { workspaceId } : {}),
    serviceType,
  });
  return resp as unknown as TelemetryServiceStatus;
}

/**
 * Gate a read command on the telemetry service being active. "Not activated"
 * is a state the CLI can authoritatively explain (via the status API), so it
 * raises AUTH with a hint pointing at the matching enable command instead of
 * letting the read fail with an opaque server error.
 *
 * requireInstance: alert rules live on shared CMS, so openStatus alone is
 * enough; dedicated-Prometheus features need the instance to be Ready.
 */
export async function ensureTelemetryReady(
  client: Client,
  opts: {
    serviceType: string;
    workspaceId?: string;
    enableCommand: string;
    requireInstance?: boolean;
  },
): Promise<void> {
  const status = await getTelemetryServiceStatus(client, opts.serviceType, opts.workspaceId);
  const ready =
    opts.requireInstance === false
      ? status.openStatus
      : status.openStatus && status.instanceStatus === "Ready";
  if (ready) return;
  throw new BailianError(
    "The monitoring service is not activated yet.",
    ExitCode.AUTH,
    `Run \`${opts.enableCommand}\` to activate it, or enable it in the Bailian console.`,
  );
}

// ---------------------------------------------------------------------------
// Service-linked role (SLR) helpers
// ---------------------------------------------------------------------------

const SLR_STATUS_API = "zeldaEasy.bailian-telemetry.activate.getTelemetrySlrStatus";
const CREATE_SLR_API = "zeldaEasy.bailian-telemetry.activate.createTelemetrySlr";

export type TelemetrySlrType = "Log" | "Xtrace" | "Cms";

export async function getTelemetrySlrAuthorized(
  client: Client,
  slrType: TelemetrySlrType,
  workspaceId?: string,
): Promise<boolean> {
  const raw = await client.console(SLR_STATUS_API, {
    reqDTO: { ...(workspaceId ? { workspaceId } : {}), slrType },
  });
  return unwrapConsolePrimitive<boolean>(raw) === true;
}

/**
 * Authorize a service-linked role when missing. The role takes effect with a
 * short delay, so after submitting we poll the status API briefly; a lagging
 * status is not treated as a failure (downstream APIs re-check anyway).
 */
export async function ensureTelemetrySlrAuthorized(
  client: Client,
  slrType: TelemetrySlrType,
  workspaceId?: string,
  opts: {
    pollRetries?: number;
    pollIntervalMs?: number;
    onProgress?: (message: string) => void;
  } = {},
): Promise<boolean> {
  if (await getTelemetrySlrAuthorized(client, slrType, workspaceId)) return true;

  opts.onProgress?.("Authorizing the service-linked role...");
  await client.console(CREATE_SLR_API, {
    reqDTO: { ...(workspaceId ? { workspaceId } : {}), slrType },
  });

  const retries = opts.pollRetries ?? 10;
  const intervalMs = opts.pollIntervalMs ?? 2000;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (await getTelemetrySlrAuthorized(client, slrType, workspaceId)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Telemetry group delivery switches (AuditLog / InferenceLog / Monitor)
// ---------------------------------------------------------------------------

const GROUP_STATUS_API = "zeldaEasy.bailian-telemetry.telemetryGroup.getTelemetryGroupStatus";
export const ENABLE_GROUP_API = "zeldaEasy.bailian-telemetry.telemetryGroup.enableTelemetryGroup";
export const DISABLE_GROUP_API = "zeldaEasy.bailian-telemetry.telemetryGroup.disableTelemetryGroup";

interface TelemetryGroupRecord {
  resourceId?: string;
  resourceType?: string;
  telemetryType?: string;
  telemetryStatus?: string;
  workspaceId?: string;
}

/** The gateway may wrap the record array in `result` / `list`, or return it bare. */
function extractGroupRecords(resp: Record<string, unknown>): TelemetryGroupRecord[] {
  for (const key of ["result", "list", "data"]) {
    const value = resp[key];
    if (Array.isArray(value)) return value as TelemetryGroupRecord[];
  }
  return [];
}

/**
 * Read a workspace-wide delivery switch (`resourceIds: ['all']`) for one
 * telemetry type: `true` = enabled, `false` = explicitly disabled,
 * `null` = never configured in this workspace.
 */
export async function getTelemetryGroupSwitch(
  client: Client,
  telemetryType: string,
  workspaceId?: string,
): Promise<boolean | null> {
  const raw = await client.console(GROUP_STATUS_API, {
    reqDTO: {
      ...(workspaceId ? { workspaceId } : {}),
      resourceType: "model",
      resourceIds: ["all"],
      telemetryType,
    },
  });
  // The final payload is usually the record array itself; some gateways wrap
  // it in `result` / `list` / `data` instead.
  const unwrapped = unwrapResponse(raw as Record<string, unknown>);
  const records = Array.isArray(unwrapped)
    ? (unwrapped as TelemetryGroupRecord[])
    : extractGroupRecords(unwrapped);
  const own = records.filter(
    (record) => !workspaceId || String(record.workspaceId) === String(workspaceId),
  );
  if (own.length === 0) return null;
  return own[0].telemetryStatus === "enable";
}

/** reqDTO for enable/disableTelemetryGroup across every model in the workspace. */
export function buildGroupSwitchReqDTO(
  settings: Settings,
  telemetryType: string,
): Record<string, unknown> {
  return {
    ...(settings.workspaceId
      ? { workspaceId: settings.workspaceId, filterWorkspaceId: settings.workspaceId }
      : {}),
    resourceId: "all",
    resourceType: "model",
    telemetryType,
  };
}

// ---------------------------------------------------------------------------
// Shared monitor filter flags
// ---------------------------------------------------------------------------

/** Common filter flags shared by monitor/log read commands. */
export const TELEMETRY_FILTER_FLAGS = {
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Model name(s), comma-separated",
      "zh-CN": "模型名称，多个名称以逗号分隔",
    },
  },
  apiKeyId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "API key ID(s), comma-separated",
      "zh-CN": "API Key ID，多个以逗号分隔",
    },
  },
  channel: {
    type: "string",
    valueHint: "<channel>",
    description: {
      "en-US": "Call channel(s), comma-separated",
      "zh-CN": "调用渠道，多个以逗号分隔",
    },
  },
  source: {
    type: "string",
    valueHint: "<source>",
    description: {
      "en-US": "Call source(s), comma-separated",
      "zh-CN": "调用来源，多个以逗号分隔",
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
} satisfies FlagsDef;

/**
 * Monitor commands only cover real-time (online) inference, so they expose
 * every telemetry filter except `--call-source`.
 */
export const TELEMETRY_MONITOR_FILTER_FLAGS = {
  model: TELEMETRY_FILTER_FLAGS.model,
  apiKeyId: TELEMETRY_FILTER_FLAGS.apiKeyId,
  channel: TELEMETRY_FILTER_FLAGS.channel,
  source: TELEMETRY_FILTER_FLAGS.source,
} satisfies FlagsDef;

export interface TelemetryFilterFlags {
  model?: string;
  apiKeyId?: string;
  channel?: string;
  source?: string;
  callSource?: "Online" | "Offline";
}

function splitDefined(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = parseCommaList(value);
  return items.length ? items : undefined;
}

/** Map CLI filter flags to the platform-model reqDTO filter fields. */
export function buildTelemetryFilters(
  flags: TelemetryFilterFlags,
  workspaceId?: string,
): Record<string, unknown> {
  return {
    ...(workspaceId ? { workspaceId } : {}),
    models: splitDefined(flags.model),
    apikeyIds: splitDefined(flags.apiKeyId),
    channels: splitDefined(flags.channel),
    sources: splitDefined(flags.source),
    modelCallSource: flags.callSource,
  };
}
