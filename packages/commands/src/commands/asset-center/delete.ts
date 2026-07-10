import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { AssetBatchResponse } from "./types.ts";
import {
  ASSET_API,
  ASSET_ID_FLAG,
  callAssetApi,
  dryRunPayload,
  validateAssetIds,
} from "./utils.ts";

const DELETE_FLAGS = {
  ...ASSET_ID_FLAG,
  permanent: {
    type: "switch",
    description: "Permanently delete assets (cannot be restored)",
  },
} satisfies FlagsDef;

/**
 * `bl asset-center delete` — 删除资产（默认软删到回收站）。
 *
 * 软删可恢复；--permanent 为永久删除。支持重复 --id（单次最多 100 个）。
 */
export default defineCommand({
  description: "Delete assets (soft delete to recycle bin by default)",
  auth: "console",
  usageArgs: "--id <asset-id> [--id <asset-id>...] [flags]",
  flags: DELETE_FLAGS,
  exampleArgs: ["--id asset-001", "--id asset-001 --id asset-002", "--id asset-001 --permanent"],
  validate(flags) {
    return validateAssetIds(flags.id);
  },
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const assetIdList = flags.id;
    const deleteType = flags.permanent ? "PERMANENT_DELETE" : "SOFT_DELETE";
    const body = { assetIdList, deleteType };

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.batchDeleteAsset, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetBatchResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.batchDeleteAsset,
      body,
    );

    const verb = flags.permanent ? "Permanently deleted" : "Deleted";
    if (settings.quiet || format === "text") {
      emitBare(`${verb} ${data.affectedCount ?? assetIdList.length} asset(s).`);
    } else {
      emitResult(
        { affected_count: data.affectedCount ?? assetIdList.length, delete_type: deleteType },
        format,
      );
    }
  },
});
