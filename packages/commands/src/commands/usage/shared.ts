import {
  fetchModelList,
  BailianError,
  ExitCode,
  unwrapResponse,
  type Client,
  type Settings,
} from "bailian-cli-core";
import { ansi, renderBoxTable, displayWidth, padEnd } from "bailian-cli-runtime";

// ---------------------------------------------------------------------------
// Common formatters
// ---------------------------------------------------------------------------

export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

export function formatDate(ts: number): string {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(ts: number): string {
  const date = new Date(ts);
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${formatDate(ts)} ${hour}:${minute}:${second}`;
}

export function requireWorkspaceId(settings: Settings, binName: string): string {
  if (settings.workspaceId) return settings.workspaceId;

  throw new BailianError(
    `workspace-id is required. Set via --workspace-id, BAILIAN_WORKSPACE_ID, or \`${binName} config set workspace_id <id>\`.`,
    ExitCode.GENERAL,
    `Run \`${binName} workspace list\` to view available workspaces.`,
  );
}

/**
 * @deprecated Use `unwrapResponse` from bailian-cli-core instead.
 * Kept here only for internal backward-compat with callers that already import this.
 */
export function extractResponseData(result: Record<string, unknown>): Record<string, unknown> {
  return unwrapResponse(result);
}

// ---------------------------------------------------------------------------
// Model catalog + capability → type mapping
// ---------------------------------------------------------------------------

const CAPABILITY_TO_TYPE: Record<string, string> = {
  Reasoning: "Text",
  TG: "Text",
  VU: "Text",
  IG: "Vision",
  VG: "Vision",
  "Realtime-Omni": "Multimodal",
  "Multimodal-Omni": "Multimodal",
  ASR: "Audio",
  TTS: "Audio",
  "Voice-Replication": "Audio",
  "Realtime-Text-to-Speech": "Audio",
  "Realtime-Voice-Replication": "Audio",
  "Realtime-ASR": "Audio",
  "Realtime-Audio-Translate": "Audio",
  ME: "Embedding",
  TR: "Embedding",
};

export function resolveModelType(capabilities: string[]): string {
  for (const capability of capabilities) {
    const type = CAPABILITY_TO_TYPE[capability];
    if (type) return type;
  }
  return "-";
}

export interface ModelInfo {
  name: string;
  type: string;
}

export async function fetchAllModels(client: Client): Promise<ModelInfo[]> {
  const allModels: Record<string, unknown>[] = [];
  let page = 1;
  while (true) {
    const result = await fetchModelList((api, data) => client.console(api, data), {
      pageNo: page,
      pageSize: 50,
    });
    allModels.push(...result.models);
    if (allModels.length >= result.total) break;
    page++;
  }
  return allModels
    .filter((item) => typeof item.model === "string" && item.model)
    .map((item) => ({
      name: item.model as string,
      type: resolveModelType((item.capabilities as string[]) || []),
    }));
}

// ---------------------------------------------------------------------------
// Free-tier quota
// ---------------------------------------------------------------------------

export const FREE_TIER_API = "zeldaEasy.bailian-commerce.freeTrial.queryFreeTierQuota";
export const FREE_TIER_ONLY_STATUS_API =
  "zeldaEasy.bailian-commerce.freeTrial.queryFreeTierOnlyStatus";

export interface FreeTierQuota {
  model: string;
  quotaInitTotal: number;
  quotaTotal: number;
  quotaValidityPeriod: number;
  quotaStatus: string;
}

export interface FreeTierOnlyStatus {
  model: string;
  freeTierOnly: boolean;
}

function extractFreeTierField<T>(result: unknown, field: string): T[] {
  const root = result as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  if (!data) return [];

  const dataV2 = data.DataV2 as Record<string, unknown> | undefined;
  if (dataV2) {
    const inner = dataV2.data as Record<string, unknown> | undefined;
    const innerData = inner?.data as Record<string, unknown> | undefined;
    return (innerData?.[field] as T[]) || [];
  }

  const direct = data.data as Record<string, unknown> | undefined;
  return (direct?.[field] as T[]) || [];
}

export function extractQuotas(result: unknown): FreeTierQuota[] {
  return extractFreeTierField<FreeTierQuota>(result, "freeTierQuotas");
}

export function extractFreeTierOnlyStatuses(result: unknown): FreeTierOnlyStatus[] {
  return extractFreeTierField<FreeTierOnlyStatus>(result, "freeTierOnlyStatuses");
}

/** Remaining percentage for a quota row, or null when it is unavailable/expired. */
export function quotaRemainingPercent(quota: FreeTierQuota): number | null {
  if (isExpired(quota)) return null;
  if (quota.quotaInitTotal == null || quota.quotaInitTotal <= 0) return null;
  return Math.round((quota.quotaTotal / quota.quotaInitTotal) * 1000) / 10;
}

function isExpired(quota: FreeTierQuota): boolean {
  return quota.quotaValidityPeriod > 0 && quota.quotaValidityPeriod < Date.now();
}

export interface FreeTierTableOptions {
  quotas: FreeTierQuota[];
  stopMap: Map<string, boolean>;
  typeMap: Map<string, string>;
  /** Optional section title, e.g. "Free Tier Quota · 225 models". */
  title?: string;
  /** Optional dim hint printed below the table, e.g. "+ 215 more · bl usage free". */
  moreHint?: string;
}

/** Print a free-tier quota table with a highlighted header and Quota Left gauge. */
export function printFreeTierTable(options: FreeTierTableOptions): void {
  const { quotas, stopMap, typeMap } = options;
  const color = ansi(process.stdout);

  if (options.title) {
    process.stdout.write(color.purple(options.title) + "\n");
  }

  const headers = ["Model", "Type", "Remaining", "Total", "Quota Left", "Auto-Stop"];
  const percents: (number | null)[] = [];
  const barLabels: (string | null)[] = [];
  const autoStopCol = headers.length - 1;

  const rows = quotas.map((quota) => {
    const hasQuota = quota.quotaInitTotal != null && quota.quotaTotal != null;
    const expired = isExpired(quota);
    const remaining = hasQuota
      ? `${formatNumber(quota.quotaTotal)}${expired ? " (expired)" : ""}`
      : "-";
    const total = hasQuota ? formatNumber(quota.quotaInitTotal) : "-";

    const percent = quotaRemainingPercent(quota);
    percents.push(percent);
    barLabels.push(expired ? "expired" : percent == null ? "-" : null);

    const stopStatus = stopMap.get(quota.model);
    const autoStop =
      quota.quotaStatus === "UNKNOWN"
        ? "Unsupported"
        : stopStatus === true
          ? "ON"
          : stopStatus === false
            ? "OFF"
            : "-";

    return [quota.model, typeMap.get(quota.model) || "-", remaining, total, "", autoStop];
  });

  const lines = renderBoxTable({
    headers,
    rows,
    align: ["left", "left", "right", "right", "left", "left"],
    barColumns: [{ index: 4, percents, labels: barLabels }],
    cellColor: (_rowIndex, colIndex, value) => {
      if (colIndex !== autoStopCol) return undefined;
      if (value === "ON") return color.green(value);
      if (value === "OFF") return color.yellow(value);
      return undefined;
    },
  });

  for (const line of lines) process.stdout.write(line + "\n");

  if (options.moreHint) {
    process.stdout.write(color.dim(options.moreHint) + "\n");
  }
}

// ---------------------------------------------------------------------------
// Usage statistics (telemetry)
// ---------------------------------------------------------------------------

export const OVERVIEW_API = "zeldaEasy.bailian-telemetry.model.getModelUsageStatistic";
export const LIST_API = "zeldaEasy.bailian-telemetry.model.listModelUsageStatisticData";

export interface UsageItem {
  key: string;
  value: number;
  unit: string;
}

export interface OverviewStatistic {
  callCount: number;
  modelCount: number;
  callSuccessCount: number;
  usages: UsageItem[];
}

export interface ModelStatisticItem {
  model: string;
  callSuccessCount: number;
  usages?: UsageItem[];
  usage?: Record<string, number | undefined>;
}

export interface ListStatisticResponse {
  list: ModelStatisticItem[];
  totalCount: number;
  maxResults: number;
}

const POLL_INTERVAL_MS = 500;
const DEFAULT_MAX_POLLS = 30;

/**
 * Poll a console API until it returns a terminal (non task-id) response.
 * The gateway answers an async request with a bare `{taskId}` envelope; the
 * caller re-issues with that id until real data arrives or the budget runs out.
 * `buildRequest` shapes each attempt (initial call vs. taskId follow-up) so the
 * same loop serves every request-wrapper convention (telemetry `reqDTO`,
 * free-tier batch `…Request`).
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

/** Free-tier batch activate/deactivate wrap the payload in `requestKey` and echo `taskId`. */
export async function pollFreeTierBatch(
  client: Client,
  api: string,
  requestKey: string,
  models: string[],
): Promise<unknown> {
  return pollConsoleUntilDone(
    client,
    api,
    (taskId) => ({ [requestKey]: taskId ? { taskId } : { models } }),
    20,
  );
}

export function extractOverviewData(result: unknown): OverviewStatistic | undefined {
  const resp = extractResponseData(result as Record<string, unknown>);
  if (resp.callSuccessCount !== undefined || resp.usages !== undefined) {
    return resp as unknown as OverviewStatistic;
  }
  return undefined;
}

export function extractListData(result: unknown): ListStatisticResponse {
  const resp = extractResponseData(result as Record<string, unknown>);
  const list = (resp.list as ModelStatisticItem[]) ?? [];
  const totalCount = (resp.totalCount as number) ?? 0;
  const maxResults = (resp.maxResults as number) ?? 0;
  return { list, totalCount, maxResults };
}

export function resolveUsageMap(item: ModelStatisticItem): Record<string, number> {
  const out: Record<string, number> = {};
  if (item.usages && Array.isArray(item.usages)) {
    for (const entry of item.usages) {
      if (entry.key && entry.value != null) out[entry.key] = entry.value;
    }
  }
  if (item.usage && typeof item.usage === "object") {
    for (const [key, val] of Object.entries(item.usage)) {
      if (val != null) out[key] = val;
    }
  }
  return out;
}

interface UsageLabel {
  en: string;
  unit?: string;
}

export const USAGE_KEY_LABELS: Record<string, UsageLabel> = {
  total_token: { en: "Total Tokens", unit: "tokens" },
  input_token: { en: "Input Tokens", unit: "tokens" },
  output_token: { en: "Output Tokens", unit: "tokens" },
  input_token_cache: { en: "Cached Tokens", unit: "tokens" },
  input_token_cache_read: { en: "Cache Read", unit: "tokens" },
  input_token_cache_creation: { en: "Cache Creation", unit: "tokens" },
  thinking_input_token: { en: "Thinking Input", unit: "tokens" },
  thinking_output_token: { en: "Thinking Output", unit: "tokens" },
  text_input_token: { en: "Text Input", unit: "tokens" },
  purein_text_output_token: { en: "Text Output", unit: "tokens" },
  embedding_token: { en: "Embedding", unit: "tokens" },
  image_number: { en: "Images", unit: "images" },
  video_duration: { en: "Video Duration", unit: "sec" },
  content_duration: { en: "Audio Duration", unit: "sec" },
  tts_text_number: { en: "TTS Chars", unit: "chars" },
  total_token_avg: { en: "Avg Tokens/Req" },
};

export function formatUsageLabel(key: string): string {
  const label = USAGE_KEY_LABELS[key];
  if (!label) return key;
  const unitSuffix = label.unit ? ` [${label.unit}]` : "";
  return `${label.en}${unitSuffix}`;
}

/** Print the account usage overview as an aligned key-value block. */
export function printUsageOverview(
  stat: OverviewStatistic,
  startTime: number,
  endTime: number,
  days: number,
  title = "Usage Overview",
): void {
  const color = ansi(process.stdout);

  process.stdout.write(
    `${color.purple(title)} ${color.dim("·")} ${formatDate(startTime)} ~ ${formatDate(endTime)} ${color.dim(`(${days} days)`)}\n`,
  );

  const rows: [string, string][] = [
    ["Models Called", formatNumber(stat.modelCount ?? 0)],
    ["Successful Calls", formatNumber(stat.callSuccessCount ?? 0)],
  ];

  for (const usage of stat.usages ?? []) {
    rows.push([formatUsageLabel(usage.key), formatNumber(usage.value)]);
  }

  const maxLabel = Math.max(...rows.map(([label]) => displayWidth(label)));
  for (const [label, value] of rows) {
    process.stdout.write(`${color.bold(padEnd(label, maxLabel + 2))}${value}\n`);
  }
}
