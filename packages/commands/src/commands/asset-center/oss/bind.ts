import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { AssetTransferPolicyCreateResponse } from "../types.ts";
import { ASSET_API, callAssetApi, dryRunPayload } from "../utils.ts";

const BIND_FLAGS = {
  bucket: {
    type: "string",
    valueHint: "<name>",
    description: "OSS bucket name",
    required: true,
  },
  region: {
    type: "string",
    valueHint: "<region>",
    description: "OSS bucket region (e.g. cn-hangzhou)",
    required: true,
  },
  pathPrefix: {
    type: "string",
    valueHint: "<prefix>",
    description: "OSS path prefix (must not start with /)",
    required: true,
  },
  policy: {
    type: "string",
    valueHint: "<policy>",
    description: "Transfer policy: ALL or BEFORE_DAYS",
    choices: ["ALL", "BEFORE_DAYS"] as const,
    required: true,
  },
  beforeDays: {
    type: "number",
    valueHint: "<n>",
    description: "Transfer assets older than N days (required when policy=BEFORE_DAYS)",
  },
  deleteAfterTransfer: {
    type: "switch",
    description: "Delete from platform after transfer completes",
  },
} satisfies FlagsDef;

/**
 * `bl asset-center oss bind` — 创建 OSS 转存策略（绑定 bucket）。
 *
 * --policy ALL 转存全部资产；BEFORE_DAYS 需配合 --before-days。
 * 可选 --delete-after-transfer 在转存完成后从平台删除。
 */
export default defineCommand({
  description: "Create OSS transfer policy (bind bucket for asset transfer)",
  auth: "console",
  usageArgs: "--bucket <name> --region <region> --path-prefix <prefix> --policy <policy> [flags]",
  flags: BIND_FLAGS,
  exampleArgs: [
    "--bucket my-bucket --region cn-hangzhou --path-prefix bailian-assets/ --policy ALL",
    "--bucket my-bucket --region cn-hangzhou --path-prefix bailian/ --policy BEFORE_DAYS --before-days 30",
  ],
  validate(flags) {
    if (flags.policy === "BEFORE_DAYS" && flags.beforeDays === undefined) {
      return "--before-days is required when --policy is BEFORE_DAYS.";
    }
    if (flags.pathPrefix.startsWith("/")) {
      return "--path-prefix must not start with /.";
    }
    if (!flags.pathPrefix.trim()) {
      return "--path-prefix must not be empty.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const body: Record<string, unknown> = {
      transferPolicy: flags.policy,
      ossBucket: flags.bucket,
      ossBucketRegion: flags.region,
      ossPathPrefix: flags.pathPrefix,
    };
    if (flags.beforeDays !== undefined) body.transferBeforeDays = flags.beforeDays;
    if (flags.deleteAfterTransfer) body.deleteAfterTransfer = true;

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.createAssetTransferPolicy, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetTransferPolicyCreateResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.createAssetTransferPolicy,
      body,
    );

    if (settings.quiet || format === "text") {
      emitBare(`Transfer policy created: ${data.policyId ?? "-"}`);
    } else {
      emitResult({ policy_id: data.policyId }, format);
    }
  },
});
