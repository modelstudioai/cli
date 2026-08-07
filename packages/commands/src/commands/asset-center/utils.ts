import {
  BailianError,
  ExitCode,
  effectiveConsoleGatewayConfig,
  type Client,
  type FlagsDef,
  type ParsedFlags,
  type Settings,
} from "bailian-cli-core";
import type { AssetHttpBaseRequest, AssetSyncOssStatus, AssetType } from "./types.ts";

const ASSET_SERVICE = "dashscopeModel";
const ASSET_BASE = "/zelda/api/v1/bailian/asset";
export const MAX_ASSET_BATCH_SIZE = 100;

export const ASSET_API = {
  listModelGeneratedAsset: assetApi("listModelGeneratedAsset"),
  getModelGeneratedAsset: assetApi("getModelGeneratedAsset"),
  batchFavoriteAsset: assetApi("batchFavoriteAsset"),
  batchUnfavoriteAsset: assetApi("batchUnfavoriteAsset"),
  batchDeleteAsset: assetApi("batchDeleteAsset"),
  batchGetAssetDownloadUrl: assetApi("batchGetAssetDownloadUrl"),
  countModelGeneratedAsset: assetApi("countModelGeneratedAsset"),
  getStorageQuota: assetApi("getStorageQuota"),
} as const;

export const ASSET_ID_FLAG = {
  id: {
    type: "array",
    valueHint: "<asset-id>",
    description: "Asset ID(s) to operate on (repeatable, max 100)",
    required: true,
  },
} satisfies FlagsDef;

export const ASSET_LIST_FILTER_FLAGS = {
  type: {
    type: "string",
    valueHint: "<type>",
    description: "Asset type: IMAGE, VIDEO, or AUDIO",
    choices: ["IMAGE", "VIDEO", "AUDIO"] as const,
  },
  model: {
    type: "string",
    valueHint: "<name>",
    description: "Filter by model name",
  },
  keyword: {
    type: "string",
    valueHint: "<text>",
    description: "Filter by asset name (substring match)",
  },
  favorited: {
    type: "switch",
    description: "Show or count only favorited assets",
  },
  recycleBin: {
    type: "switch",
    description: "Show or count soft-deleted assets (recycle bin)",
  },
  syncStatus: {
    type: "string",
    valueHint: "<status>",
    description: "OSS sync status filter",
    choices: ["NOT_SYNCED", "IN_SYNCING", "SYNC_SUCCESS", "SYNC_FAILED"] as const,
  },
  beginTime: {
    type: "string",
    valueHint: "<datetime>",
    description: "Filter by generate time start (ISO_LOCAL_DATE_TIME)",
  },
  endTime: {
    type: "string",
    valueHint: "<datetime>",
    description: "Filter by generate time end (ISO_LOCAL_DATE_TIME)",
  },
} satisfies FlagsDef;

type AssetListFilterFlags = ParsedFlags<typeof ASSET_LIST_FILTER_FLAGS>;

function assetApi(action: string): string {
  return `zeldaHttp.${ASSET_SERVICE}.${ASSET_BASE}/${action}`;
}

function getNestedRecord(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const val = obj[key];
  if (val && typeof val === "object" && !Array.isArray(val)) return val as Record<string, unknown>;
  return undefined;
}

export function extractAssetResponse<T>(result: unknown): T {
  const raw = result as Record<string, unknown>;
  const data = getNestedRecord(raw, "data");
  if (!data) {
    throw new BailianError("Unexpected empty response from asset API.", ExitCode.GENERAL);
  }

  const dataV2 = getNestedRecord(data, "DataV2");
  const payload = dataV2
    ? (getNestedRecord(getNestedRecord(dataV2, "data") ?? dataV2, "data") ??
      getNestedRecord(dataV2, "data") ??
      dataV2)
    : (getNestedRecord(data, "data") ?? data);

  if (payload.success === false) {
    const message =
      typeof payload.message === "string" && payload.message.length > 0
        ? payload.message
        : typeof payload.code === "string"
          ? payload.code
          : "Asset API request failed.";
    throw new BailianError(message, ExitCode.GENERAL);
  }

  if (payload.data !== undefined) {
    return payload.data as T;
  }

  return payload as T;
}

export function requireWorkspaceId(settings: Settings, binName: string): string {
  if (settings.workspaceId) return settings.workspaceId;

  throw new BailianError(
    `workspace-id is required. Set via --workspace-id, BAILIAN_WORKSPACE_ID, or \`${binName} config set workspace_id <id>\`.`,
    ExitCode.GENERAL,
    `Run \`${binName} workspace list\` to view available workspaces.`,
  );
}

export function buildBaseRequest(settings: Settings, binName: string): AssetHttpBaseRequest {
  // workspace 由 CLI 注入；tenantId / mainAccountUid 由 Console 网关从登录 session 自动填充，
  // CLI 侧无需也不应手动解析阿里云账号 ID。
  return {
    workspace: requireWorkspaceId(settings, binName),
    apiSource: "CLI",
  };
}

export function buildListFilterBody(flags: AssetListFilterFlags): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (flags.type) body.assetType = flags.type as AssetType;
  if (flags.model) body.modelName = flags.model;
  if (flags.keyword) body.assetName = flags.keyword;
  if (flags.favorited) body.favorited = true;
  if (flags.recycleBin) {
    body.deleteStatus = "SOFT_DELETED";
  } else {
    body.deleteStatus = "NORMAL";
  }
  if (flags.syncStatus) body.syncOssDataStatus = flags.syncStatus as AssetSyncOssStatus;
  if (flags.beginTime) body.beginTime = flags.beginTime;
  if (flags.endTime) body.endTime = flags.endTime;

  return body;
}

export function validateAssetIds(ids: string[] | undefined): string | undefined {
  if (!ids || ids.length === 0) {
    return "At least one --id is required.";
  }
  if (ids.length > MAX_ASSET_BATCH_SIZE) {
    return `At most ${MAX_ASSET_BATCH_SIZE} asset IDs are allowed per request.`;
  }
  return undefined;
}

export async function callAssetApi<T>(
  client: Client,
  settings: Settings,
  binName: string,
  api: string,
  body: Record<string, unknown>,
): Promise<T> {
  const payload = { ...buildBaseRequest(settings, binName), ...body };
  const raw = await client.console(api, payload);
  return extractAssetResponse<T>(raw);
}

export function dryRunPayload(
  settings: Settings,
  binName: string,
  api: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    api,
    data: { ...buildBaseRequest(settings, binName), ...body },
    ...effectiveConsoleGatewayConfig(settings),
  };
}

export function formatGenerateTime(ts?: number): string {
  if (ts == null) return "-";
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

export function formatStorageBytes(bytes?: number): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
