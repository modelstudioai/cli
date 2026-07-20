import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { AssetOssSlrResponse } from "../types.ts";
import { ASSET_API, callAssetApi, dryRunPayload } from "../utils.ts";

/**
 * `bl asset-center oss slr authorize` — 一键授权 OSS 服务关联角色（SLR）。
 */
export default defineCommand({
  description: "Authorize OSS service-linked role (one-click)",
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
      emitResult({ success: data.success ?? false }, format);
    }
  },
});
