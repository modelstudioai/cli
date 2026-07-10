import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { AssetOssSlrResponse } from "../types.ts";
import { ASSET_API, callAssetApi, dryRunPayload } from "../utils.ts";

/**
 * `bl asset-center oss slr status` — 检查 OSS 服务关联角色（SLR）是否已授权。
 */
export default defineCommand({
  description: "Check whether OSS service-linked role is authorized",
  auth: "console",
  usageArgs: "[flags]",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings, identity } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(dryRunPayload(settings, identity.binName, ASSET_API.checkOssSLR, {}), format);
      return;
    }

    const data = await callAssetApi<AssetOssSlrResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.checkOssSLR,
      {},
    );

    if (format === "json") {
      emitResult({ authorized: data.authorized ?? false }, format);
      return;
    }

    emitBare(data.authorized ? "OSS SLR is authorized." : "OSS SLR is not authorized.");
  },
});
