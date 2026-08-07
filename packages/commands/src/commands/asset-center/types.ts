export type AssetType = "IMAGE" | "VIDEO" | "AUDIO";

export type AssetDeleteStatus = "NORMAL" | "SOFT_DELETED" | "PERMANENTLY_DELETED";

export type AssetSyncOssStatus = "NOT_SYNCED" | "IN_SYNCING" | "SYNC_SUCCESS" | "SYNC_FAILED";

export type AssetDeleteType = "SOFT_DELETE" | "PERMANENT_DELETE";

export interface AssetHttpBaseRequest {
  workspace: string;
  tenantId?: string;
  mainAccountUid?: string;
  apiSource?: string;
}

export interface ModelGeneratedAssetItem {
  id?: number;
  assetId?: string;
  assetType?: string;
  assetName?: string;
  assetDescription?: string;
  favorited?: boolean;
  assetSize?: number;
  modelType?: string;
  modelName?: string;
  deleteStatus?: string;
  syncOssDataStatus?: string;
  generateTime?: number;
  downloadUrl?: string;
  thumbnailUrl?: string;
  gmtCreate?: string;
  gmtModified?: string;
}

export interface AssetListResponse {
  dataList?: ModelGeneratedAssetItem[];
  preToken?: number;
  nextToken?: number;
  hasNext?: boolean;
  hasPre?: boolean;
}

export interface AssetGetResponse {
  item?: ModelGeneratedAssetItem;
}

export interface AssetBatchResponse {
  success?: boolean;
  affectedCount?: number;
}

export interface AssetDownloadUrlItem {
  assetId?: string;
  downloadUrl?: string | null;
}

export interface AssetDownloadResponse {
  items?: AssetDownloadUrlItem[];
}

export interface AssetCountResponse {
  imageCount?: number;
  videoCount?: number;
  audioCount?: number;
  totalCount?: number;
}

export interface AssetStorageQuotaResponse {
  freeStorageQuota?: number;
  usedStorageSize?: number;
  extraStoragePrice?: string;
}
