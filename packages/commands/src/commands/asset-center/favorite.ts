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
 * `bl asset-center favorite` — 收藏一个或多个资产。
 *
 * 支持重复 --id（单次最多 100 个），调用 batchFavoriteAsset。
 */
export default defineCommand({
  description: "Add assets to favorites",
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
        dryRunPayload(settings, identity.binName, ASSET_API.batchFavoriteAsset, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetBatchResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.batchFavoriteAsset,
      body,
    );

    if (settings.quiet || format === "text") {
      emitBare(`Favorited ${data.affectedCount ?? assetIdList.length} asset(s).`);
    } else {
      emitResult({ affected_count: data.affectedCount ?? assetIdList.length }, format);
    }
  },
});
