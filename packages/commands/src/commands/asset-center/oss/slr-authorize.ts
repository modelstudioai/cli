import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { AssetOssSlrResponse } from "../types.ts";
import { ASSET_API, callAssetApi, dryRunPayload } from "../utils.ts";

/**
 * `bl asset-center oss slr authorize` — 创建 OSS SLR 授权。
 *
 * 已授权时跳过并提示；未授权时调用 createOssSLR。
 */
export default defineCommand({
  description: "Create OSS service-linked role authorization",
  auth: "console",
  usageArgs: "[flags]",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings, identity } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(dryRunPayload(settings, identity.binName, ASSET_API.createOssSLR, {}), format);
      return;
    }

    const status = await callAssetApi<AssetOssSlrResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.checkOssSLR,
      {},
    );

    if (status.authorized) {
      if (settings.quiet || format === "text") {
        emitBare("OSS SLR is already authorized.");
      } else {
        emitResult({ authorized: true, created: false }, format);
      }
      return;
    }

    const data = await callAssetApi<AssetOssSlrResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.createOssSLR,
      {},
    );

    if (settings.quiet || format === "text") {
      emitBare(data.success ? "OSS SLR authorized." : "OSS SLR authorization failed.");
    } else {
      emitResult({ authorized: true, created: true, success: data.success ?? false }, format);
    }
  },
});
