import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { AssetTransferPolicyMutationResponse } from "../types.ts";
import { ASSET_API, callAssetApi, dryRunPayload } from "../utils.ts";

const UNBIND_FLAGS = {
  policyId: {
    type: "string",
    valueHint: "<id>",
    description: "Transfer policy ID",
    required: true,
  },
} satisfies FlagsDef;

/**
 * `bl asset-center oss unbind` — 删除 OSS 转存策略（解绑）。
 */
export default defineCommand({
  description: "Delete OSS transfer policy (unbind)",
  auth: "console",
  usageArgs: "--policy-id <id>",
  flags: UNBIND_FLAGS,
  exampleArgs: ["--policy-id policy-abc123"],
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const body = { policyId: flags.policyId };

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.deleteAssetTransferPolicy, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetTransferPolicyMutationResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.deleteAssetTransferPolicy,
      body,
    );

    if (settings.quiet || format === "text") {
      emitBare(data.success ? "Transfer policy deleted." : "Transfer policy delete failed.");
    } else {
      emitResult({ success: data.success ?? false }, format);
    }
  },
});
