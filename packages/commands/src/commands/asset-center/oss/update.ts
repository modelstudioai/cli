import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { AssetTransferPolicyMutationResponse } from "../types.ts";
import { ASSET_API, callAssetApi, dryRunPayload } from "../utils.ts";

const UPDATE_FLAGS = {
  policyId: {
    type: "string",
    valueHint: "<id>",
    description: "Transfer policy ID",
    required: true,
  },
  bucket: { type: "string", valueHint: "<name>", description: "OSS bucket name" },
  region: { type: "string", valueHint: "<region>", description: "OSS bucket region" },
  pathPrefix: {
    type: "string",
    valueHint: "<prefix>",
    description: "OSS path prefix (must not start with /)",
  },
  policy: {
    type: "string",
    valueHint: "<policy>",
    description: "Transfer policy: ALL or BEFORE_DAYS",
    choices: ["ALL", "BEFORE_DAYS"] as const,
  },
  beforeDays: {
    type: "number",
    valueHint: "<n>",
    description: "Transfer days threshold",
  },
  deleteAfterTransfer: {
    type: "switch",
    description: "Delete from platform after transfer completes",
  },
} satisfies FlagsDef;

/**
 * `bl asset-center oss update` — 更新已有 OSS 转存策略。
 *
 * 至少需传入一个待更新字段；policy=BEFORE_DAYS 时须带 --before-days。
 */
export default defineCommand({
  description: "Update an existing OSS transfer policy",
  auth: "console",
  usageArgs: "--policy-id <id> [flags]",
  flags: UPDATE_FLAGS,
  exampleArgs: [
    "--policy-id policy-abc123 --policy ALL",
    "--policy-id policy-abc123 --delete-after-transfer",
  ],
  validate(flags) {
    if (flags.pathPrefix?.startsWith("/")) {
      return "--path-prefix must not start with /.";
    }
    if (flags.policy === "BEFORE_DAYS" && flags.beforeDays === undefined) {
      return "--before-days is required when --policy is BEFORE_DAYS.";
    }
    const hasUpdate =
      flags.bucket ||
      flags.region ||
      flags.pathPrefix ||
      flags.policy ||
      flags.beforeDays !== undefined ||
      flags.deleteAfterTransfer;
    if (!hasUpdate) {
      return "Provide at least one field to update.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const body: Record<string, unknown> = { policyId: flags.policyId };
    if (flags.bucket) body.ossBucket = flags.bucket;
    if (flags.region) body.ossBucketRegion = flags.region;
    if (flags.pathPrefix) body.ossPathPrefix = flags.pathPrefix;
    if (flags.policy) body.transferPolicy = flags.policy;
    if (flags.beforeDays !== undefined) body.transferBeforeDays = flags.beforeDays;
    if (flags.deleteAfterTransfer) body.deleteAfterTransfer = true;

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.updateAssetTransferPolicy, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetTransferPolicyMutationResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.updateAssetTransferPolicy,
      body,
    );

    if (settings.quiet || format === "text") {
      emitBare(data.success ? "Transfer policy updated." : "Transfer policy update failed.");
    } else {
      emitResult({ success: data.success ?? false }, format);
    }
  },
});
