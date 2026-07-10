import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult, emitBare, padEnd } from "bailian-cli-runtime";
import type { AssetStorageQuotaResponse } from "./types.ts";
import { ASSET_API, callAssetApi, dryRunPayload, formatStorageBytes } from "./utils.ts";

/**
 * `bl asset-center storage` — 查看存储配额、已用容量与超额计费说明。
 */
export default defineCommand({
  description: "View storage quota, usage, and overage pricing",
  auth: "console",
  usageArgs: "[flags]",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings, identity } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(dryRunPayload(settings, identity.binName, ASSET_API.getStorageQuota, {}), format);
      return;
    }

    const data = await callAssetApi<AssetStorageQuotaResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.getStorageQuota,
      {},
    );

    if (format === "json") {
      emitResult(
        {
          used_storage_size: data.usedStorageSize,
          free_storage_quota: data.freeStorageQuota,
          extra_storage_price: data.extraStoragePrice,
        },
        format,
      );
      return;
    }

    emitBare(`${padEnd("Used", 14)} ${formatStorageBytes(data.usedStorageSize)}`);
    emitBare(`${padEnd("Free quota", 14)} ${formatStorageBytes(data.freeStorageQuota)}`);
    emitBare(`${padEnd("Overage", 14)} ${data.extraStoragePrice ?? "-"}`);
  },
});
