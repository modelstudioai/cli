import type { ConsoleCall } from "./gateway.ts";

export const MODEL_LIST_API =
  "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels";
export const PREDICT_CONFIG_API = "zeldaEasy.bmp.modelPredictRpcService.getPredictParamConfig";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Unwrap the DataV2 double-envelope that console gateway returns. */
export function unwrapResponse(result: Record<string, unknown>): Record<string, unknown> {
  const data = result.data as Record<string, unknown> | undefined;
  if (!data) return result;
  const dataV2 = data.DataV2 as Record<string, unknown> | undefined;
  if (dataV2) {
    const inner = dataV2.data as Record<string, unknown> | undefined;
    const innerData = inner?.data as Record<string, unknown> | undefined;
    return innerData ?? inner ?? dataV2;
  }
  const direct = data.data as Record<string, unknown> | undefined;
  return direct ?? data;
}

// ---------------------------------------------------------------------------
// fetchModelList — flat item list (used by advisor ApiSource)
// ---------------------------------------------------------------------------

export interface ModelListParams {
  pageNo?: number;
  pageSize?: number;
  name?: string;
  providers?: string[];
  capabilities?: string[];
}

export interface ModelListResult {
  total: number;
  models: Record<string, unknown>[];
}

/** Page the console model-list API. `call` makes the gateway request (e.g. `client.console`). */
export async function fetchModelList(
  call: ConsoleCall,
  params: ModelListParams = {},
): Promise<ModelListResult> {
  const { pageNo = 1, pageSize = 50, name = "", providers = [], capabilities = [] } = params;

  const result = (await call(MODEL_LIST_API, {
    input: {
      pageNo,
      pageSize,
      name,
      providers,
      inferenceProviders: [],
      features: [],
      group: true,
      capabilities,
      contextWindows: [],
    },
  })) as Record<string, unknown>;

  const responseData = unwrapResponse(result);
  const total = (responseData.total as number) ?? 0;
  const groups = (responseData.list as Record<string, unknown>[]) ?? [];

  const models: Record<string, unknown>[] = [];
  for (const group of groups) {
    const items = group.items as Record<string, unknown>[] | undefined;
    if (items?.length) {
      for (const item of items) models.push(item);
    } else {
      models.push(group);
    }
  }

  return { total, models };
}

/** Page through every model-list page and return all raw model items. */
export async function fetchModelListAll(
  call: ConsoleCall,
  params: Omit<ModelListParams, "pageNo"> = {},
): Promise<Record<string, unknown>[]> {
  const pageSize = params.pageSize ?? 50;
  const first = await fetchModelList(call, { ...params, pageNo: 1, pageSize });
  const allModels = [...first.models];
  const totalPages = Math.ceil(first.total / pageSize);
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const result = await fetchModelList(call, { ...params, pageNo, pageSize });
    if (result.models.length === 0) break;
    allModels.push(...result.models);
  }
  return allModels;
}

/**
 * Look up a single model by exact id. The server's `name` filter is a
 * substring match, so an exact `model` equality check narrows the result
 * (e.g. avoids `qwen3-8b` matching `qwen3-8b-v2`).
 */
export async function findModelByName(
  call: ConsoleCall,
  modelName: string,
): Promise<Record<string, unknown> | null> {
  const result = await fetchModelList(call, { name: modelName, pageSize: 50 });
  return result.models.find((item) => item.model === modelName) ?? null;
}

// ---------------------------------------------------------------------------
// Model group types — family-level structure returned by `group: true`
// ---------------------------------------------------------------------------

export interface ModelPriceInfo {
  type?: string;
  priceUnit?: string;
  price?: string | number;
  [key: string]: unknown;
}

/** Retirement notice for one service of a model. */
export interface ModelOfflineNotice {
  /** Public announcement URL; empty when the platform published none. */
  announceUrl?: string;
  /** Local-time `YYYY-MM-DD HH:mm:ss`; absent once the model is already offline. */
  offlineTime?: string;
}

/** Per-service retirement notices, keyed by service name (`inference`, …). */
export interface ModelOfflineInfo {
  inference?: ModelOfflineNotice;
}

/** A single snippet: `{ code, … }` under one language of one API style. */
export interface ModelSampleSnippet {
  code?: string;
  [key: string]: unknown;
}

/** sdk → api style → language → snippet (e.g. `openai.completionsAPI.python`). */
export type ModelSampleCodeV2 = Record<string, Record<string, Record<string, ModelSampleSnippet>>>;

export interface ModelGroupItem {
  model: string;
  name: string;
  description?: string;
  shortDescription?: string;
  provider?: string;
  capabilities?: string[];
  features?: string[];
  contextWindow?: number;
  maxOutputTokens?: number;
  maxInputTokens?: number;
  inferenceMetadata?: Record<string, unknown>;
  prices?: ModelPriceInfo[];
  qpmInfo?: Record<string, Record<string, unknown>>;
  docUrl?: string;
  versionTag?: string;
  openSource?: boolean;
  category?: string;
  predictConfig?: PredictConfigEntry[];
  /** Present once the model has been retired; an ISO timestamp. */
  offlineAt?: string;
  /** Present once retirement has been announced, before or after it takes effect. */
  offlineInfo?: ModelOfflineInfo;
  sampleCodeV2?: ModelSampleCodeV2;
  [key: string]: unknown;
}

export interface ModelGroup {
  model: string;
  name: string;
  description?: string;
  updateAt?: string;
  items: ModelGroupItem[];
  [key: string]: unknown;
}

export interface ModelGroupParams {
  pageNo?: number;
  pageSize?: number;
  name?: string;
  providers?: string[];
  capabilities?: string[];
  features?: string[];
  contextWindows?: string[];
  querySampleCode?: boolean;
}

export interface ModelGroupResult {
  total: number;
  groups: ModelGroup[];
}

// ---------------------------------------------------------------------------
// fetchModelGroups — family-level listing (used by model list / search)
// ---------------------------------------------------------------------------

/** Fetch model families with optional filters and query flags. */
export async function fetchModelGroups(
  call: ConsoleCall,
  params: ModelGroupParams = {},
): Promise<ModelGroupResult> {
  const {
    pageNo = 1,
    pageSize = 50,
    name = "",
    providers = [],
    capabilities = [],
    features = [],
    contextWindows = [],
    querySampleCode,
  } = params;

  const input: Record<string, unknown> = {
    pageNo,
    pageSize,
    name,
    providers,
    inferenceProviders: [],
    features,
    group: true,
    capabilities,
    contextWindows,
    queryPermissions: true,
    queryApplyStatus: true,
    queryActivationStatus: true,
    queryPrice: true,
    queryQpmInfo: true,
    supports: { inference: true },
  };
  if (querySampleCode) input.querySampleCode = true;

  const result = (await call(MODEL_LIST_API, { input })) as Record<string, unknown>;
  const responseData = unwrapResponse(result);
  const total = (responseData.total as number) ?? 0;
  const groups = (responseData.list as ModelGroup[]) ?? [];

  return { total, groups };
}

/** Flatten family groups into their individual model items. */
export function flattenModelGroups(groups: ModelGroup[]): ModelGroupItem[] {
  return groups.flatMap((group) => group.items ?? []);
}

/**
 * Fetch every model item in the catalog. The first page yields `total`; the
 * remaining pages are fetched concurrently because ranking needs the whole set.
 */
export async function fetchModelGroupsAll(
  call: ConsoleCall,
  params: Omit<ModelGroupParams, "pageNo"> = {},
): Promise<ModelGroupItem[]> {
  const pageSize = params.pageSize ?? 50;
  const first = await fetchModelGroups(call, {
    ...params,
    pageNo: 1,
    pageSize,
  });
  const totalPages = Math.max(1, Math.ceil(first.total / pageSize));

  const remainingPages: number[] = [];
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) remainingPages.push(pageNo);

  const remaining = await Promise.all(
    remainingPages.map((pageNo) => fetchModelGroups(call, { ...params, pageNo, pageSize })),
  );

  return flattenModelGroups([first.groups, ...remaining.map((page) => page.groups)].flat());
}

// ---------------------------------------------------------------------------
// fetchModelDetail — single family with full enrichment
// ---------------------------------------------------------------------------

/** Fetch a single model family with all detail flags enabled. */
export async function fetchModelDetail(
  call: ConsoleCall,
  modelKey: string,
): Promise<ModelGroup | null> {
  const result = (await call(MODEL_LIST_API, {
    input: {
      pageNo: 1,
      pageSize: 50,
      group: true,
      model: modelKey,
      querySampleCode: true,
      queryGroupByModel: true,
      queryWorkspaceLimit: true,
      queryPrice: true,
      queryQuota: false,
      queryQpmInfo: true,
      queryApplyStatus: true,
      queryPermissions: true,
      queryActivationStatus: true,
    },
  })) as Record<string, unknown>;

  const responseData = unwrapResponse(result);
  const list = (responseData.list as ModelGroup[]) ?? [];
  return list[0] ?? null;
}

// ---------------------------------------------------------------------------
// fetchPredictConfig — per-model input parameter schema
// ---------------------------------------------------------------------------

export interface PredictConfigEntry {
  name: string;
  key: string;
  default?: unknown;
  tip?: string;
  range?: unknown;
}

const PREDICT_CONFIG_FIELDS = ["name", "key", "default", "tip", "range"];

function slimPredictConfig(raw: Record<string, unknown>[]): PredictConfigEntry[] {
  return raw.map((entry) => {
    const slim: Record<string, unknown> = {};
    for (const field of PREDICT_CONFIG_FIELDS) {
      if (entry[field] !== undefined) slim[field] = entry[field];
    }
    return slim as unknown as PredictConfigEntry;
  });
}

/** Fetch the input parameter schema for a specific model. */
export async function fetchPredictConfig(
  call: ConsoleCall,
  modelId: string,
): Promise<PredictConfigEntry[] | null> {
  const result = (await call(PREDICT_CONFIG_API, { modelId })) as Record<string, unknown>;
  const raw = unwrapResponse(result).predictConfig;
  if (!raw) return null;

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? slimPredictConfig(parsed) : null;
    } catch {
      return null;
    }
  }

  return Array.isArray(raw) ? slimPredictConfig(raw as Record<string, unknown>[]) : null;
}
