import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, formatTable } from "bailian-cli-runtime";
import type { AssetListResponse, ModelGeneratedAssetItem } from "./types.ts";
import {
  ASSET_API,
  ASSET_LIST_FILTER_FLAGS,
  buildListFilterBody,
  callAssetApi,
  dryRunPayload,
  formatGenerateTime,
} from "./utils.ts";

const LIST_FLAGS = {
  ...ASSET_LIST_FILTER_FLAGS,
  includeDownloadUrl: {
    type: "switch",
    description: "Include signed download URLs in the response",
  },
  includeThumbnail: {
    type: "switch",
    description: "Include thumbnail URLs in the response",
  },
  thumbnailWidth: {
    type: "number",
    valueHint: "<px>",
    description: "Thumbnail width in pixels",
  },
  thumbnailHeight: {
    type: "number",
    valueHint: "<px>",
    description: "Thumbnail height in pixels",
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: "Results per page (default: 10, max: 100)",
  },
  nextToken: {
    type: "number",
    valueHint: "<token>",
    description: "Cursor for the next page",
  },
  preToken: {
    type: "number",
    valueHint: "<token>",
    description: "Cursor for the previous page",
  },
} satisfies FlagsDef;

function normalizeItem(item: ModelGeneratedAssetItem) {
  return {
    asset_id: item.assetId ?? "",
    asset_type: item.assetType ?? "",
    asset_name: item.assetName ?? "",
    model_name: item.modelName ?? "",
    favorited: item.favorited ?? false,
    generate_time: item.generateTime,
    download_url: item.downloadUrl,
    thumbnail_url: item.thumbnailUrl,
  };
}

/**
 * `bl asset-center list` — 分页查询模型生成资产列表。
 *
 * 支持类型/模型/关键词/收藏/回收站/OSS 同步状态/时间范围筛选，以及
 * --next-token / --pre-token 游标翻页；可选返回签名下载链接与缩略图 URL。
 */
export default defineCommand({
  description: "List model-generated assets with filters and cursor pagination",
  auth: "console",
  usageArgs: "[flags]",
  flags: LIST_FLAGS,
  exampleArgs: [
    "",
    "--type IMAGE --model qwen-image-3.0",
    "--favorited --page-size 20",
    "--recycle-bin",
    "--keyword landscape --output json",
  ],
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const pageSize = flags.pageSize ?? 10;

    const body: Record<string, unknown> = {
      ...buildListFilterBody(flags),
      pageSize,
    };
    if (flags.includeDownloadUrl) body.includeDownloadUrl = true;
    if (flags.includeThumbnail) body.includeThumbnail = true;
    if (flags.thumbnailWidth !== undefined) body.thumbnailWidth = flags.thumbnailWidth;
    if (flags.thumbnailHeight !== undefined) body.thumbnailHeight = flags.thumbnailHeight;
    if (flags.nextToken !== undefined) body.nextToken = flags.nextToken;
    if (flags.preToken !== undefined) body.preToken = flags.preToken;

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.listModelGeneratedAsset, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetListResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.listModelGeneratedAsset,
      body,
    );

    const items = (data.dataList ?? []).map(normalizeItem);

    if (format === "json") {
      emitResult(
        {
          items,
          pre_token: data.preToken,
          next_token: data.nextToken,
          has_next: data.hasNext,
          has_pre: data.hasPre,
        },
        format,
      );
      return;
    }

    if (items.length === 0) {
      emitBare("No assets found.");
      return;
    }

    const headers = ["ASSET_ID", "TYPE", "NAME", "MODEL", "FAVORITED", "GENERATED"];
    const rows = items.map((item) => [
      item.asset_id,
      item.asset_type,
      item.asset_name,
      item.model_name,
      item.favorited ? "yes" : "-",
      formatGenerateTime(item.generate_time),
    ]);
    for (const line of formatTable(headers, rows)) emitBare(line);

    const parts: string[] = [];
    if (data.hasPre) parts.push("has previous page");
    if (data.hasNext) parts.push(`next token: ${data.nextToken}`);
    if (parts.length > 0) emitBare(`\n${parts.join("; ")}`);
  },
});
