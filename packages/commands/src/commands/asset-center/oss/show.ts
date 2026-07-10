import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, padEnd } from "bailian-cli-runtime";
import type { AssetTransferPolicy } from "../types.ts";
import { ASSET_API, callAssetApi, dryRunPayload } from "../utils.ts";

const SHOW_FLAGS = {
  policyId: {
    type: "string",
    valueHint: "<id>",
    description: "Policy ID (optional; omit to query by workspace)",
  },
} satisfies FlagsDef;

/**
 * `bl asset-center oss show` — 查看当前 OSS 转存策略。
 *
 * 可省略 --policy-id，按 workspace 查询默认策略。
 */
export default defineCommand({
  description: "View current OSS transfer policy",
  auth: "console",
  usageArgs: "[--policy-id <id>] [flags]",
  flags: SHOW_FLAGS,
  exampleArgs: ["", "--policy-id policy-abc123 --output json"],
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const body: Record<string, unknown> = {};
    if (flags.policyId) body.policyId = flags.policyId;

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.getAssetTransferPolicy, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetTransferPolicy>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.getAssetTransferPolicy,
      body,
    );

    if (format === "json") {
      emitResult(data, format);
      return;
    }

    emitBare(`${padEnd("PolicyId", 18)} ${data.policyId ?? "-"}`);
    emitBare(`${padEnd("Policy", 18)} ${data.transferPolicy ?? "-"}`);
    emitBare(`${padEnd("BeforeDays", 18)} ${data.transferBeforeDays ?? "-"}`);
    emitBare(`${padEnd("Bucket", 18)} ${data.ossBucket ?? "-"}`);
    emitBare(`${padEnd("Region", 18)} ${data.ossBucketRegion ?? "-"}`);
    emitBare(`${padEnd("PathPrefix", 18)} ${data.ossPathPrefix ?? "-"}`);
    emitBare(`${padEnd("DeleteAfter", 18)} ${data.deleteAfterTransfer ? "yes" : "no"}`);
  },
});
