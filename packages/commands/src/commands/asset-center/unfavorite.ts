import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { AssetBatchResponse } from "./types.ts";
import {
  ASSET_API,
  ASSET_ID_FLAG,
  callAssetApi,
  dryRunPayload,
  validateAssetIds,
} from "./utils.ts";

/**
 * `bl asset-center unfavorite` — 取消收藏一个或多个资产。
 *
 * 支持重复 --id（单次最多 100 个），调用 batchUnfavoriteAsset。
 */
export default defineCommand({
  description: "Remove assets from favorites",
  auth: "console",
  usageArgs: "--id <asset-id> [--id <asset-id>...]",
  flags: ASSET_ID_FLAG,
  exampleArgs: ["--id asset-001", "--id asset-001 --id asset-002"],
  validate(flags) {
    return validateAssetIds(flags.id);
  },
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const assetIdList = flags.id;
    const body = { assetIdList };

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.batchUnfavoriteAsset, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetBatchResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.batchUnfavoriteAsset,
      body,
    );

    if (settings.quiet || format === "text") {
      emitBare(`Unfavorited ${data.affectedCount ?? assetIdList.length} asset(s).`);
    } else {
      emitResult({ affected_count: data.affectedCount ?? assetIdList.length }, format);
    }
  },
});
