import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, padEnd } from "bailian-cli-runtime";
import type { AssetGetResponse } from "./types.ts";
import { ASSET_API, callAssetApi, dryRunPayload, formatGenerateTime } from "./utils.ts";

const GET_FLAGS = {
  assetId: {
    type: "string",
    valueHint: "<id>",
    description: "Asset ID to query",
    required: true,
  },
  includeDownloadUrl: {
    type: "switch",
    description: "Include signed download URL",
  },
  includeThumbnail: {
    type: "switch",
    description: "Include thumbnail URL",
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
} satisfies FlagsDef;

/**
 * `bl asset-center get` — 按 ID 查询单个资产详情。
 *
 * 可选 --include-download-url / --include-thumbnail 获取签名 URL。
 */
export default defineCommand({
  description: "Get full details of a model-generated asset",
  auth: "console",
  usageArgs: "--asset-id <id> [flags]",
  flags: GET_FLAGS,
  exampleArgs: [
    "--asset-id asset-001",
    "--asset-id asset-001 --include-download-url --output json",
  ],
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const assetId = flags.assetId;

    const body: Record<string, unknown> = { assetId };
    if (flags.includeDownloadUrl) body.includeDownloadUrl = true;
    if (flags.includeThumbnail) body.includeThumbnail = true;
    if (flags.thumbnailWidth !== undefined) body.thumbnailWidth = flags.thumbnailWidth;
    if (flags.thumbnailHeight !== undefined) body.thumbnailHeight = flags.thumbnailHeight;

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.getModelGeneratedAsset, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetGetResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.getModelGeneratedAsset,
      body,
    );

    const item = data.item;
    if (!item) {
      emitBare("Asset not found.");
      return;
    }

    if (format === "json") {
      emitResult(item, format);
      return;
    }

    emitBare(`${padEnd("AssetId", 16)} ${item.assetId ?? "-"}`);
    emitBare(`${padEnd("Type", 16)} ${item.assetType ?? "-"}`);
    emitBare(`${padEnd("Name", 16)} ${item.assetName ?? "-"}`);
    emitBare(`${padEnd("Description", 16)} ${item.assetDescription ?? "-"}`);
    emitBare(`${padEnd("Model", 16)} ${item.modelName ?? "-"}`);
    emitBare(`${padEnd("Favorited", 16)} ${item.favorited ? "yes" : "no"}`);
    emitBare(`${padEnd("Generated", 16)} ${formatGenerateTime(item.generateTime)}`);
    if (item.downloadUrl) emitBare(`${padEnd("DownloadUrl", 16)} ${item.downloadUrl}`);
    if (item.thumbnailUrl) emitBare(`${padEnd("ThumbnailUrl", 16)} ${item.thumbnailUrl}`);
  },
});
