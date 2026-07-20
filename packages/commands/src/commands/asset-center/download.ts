import {
  defineCommand,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare, padEnd } from "bailian-cli-runtime";
import type { AssetDownloadResponse } from "./types.ts";
import { ASSET_API, callAssetApi, dryRunPayload } from "./utils.ts";

const DOWNLOAD_FLAGS = {
  id: {
    type: "string",
    valueHint: "<asset-id>",
    description: "Asset ID to get download URL for",
    required: true,
  },
} satisfies FlagsDef;

/**
 * `bl asset-center download` — 通过资产 ID 获取签名下载链接。
 *
 * 调用 batchGetAssetDownloadUrl，输出 download URL，不落盘。
 */
export default defineCommand({
  description: "Get a signed download URL for an asset by ID",
  auth: "console",
  usageArgs: "--id <asset-id>",
  flags: DOWNLOAD_FLAGS,
  exampleArgs: ["--id asset-001", "--id asset-001 --output json", "--id asset-001 --quiet"],
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const assetId = flags.id;
    const body = { assetIdList: [assetId] };

    if (settings.dryRun) {
      emitResult(
        {
          asset_id: assetId,
          action: "download",
          ...dryRunPayload(settings, identity.binName, ASSET_API.batchGetAssetDownloadUrl, body),
        },
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetDownloadResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.batchGetAssetDownloadUrl,
      body,
    );

    const url = data.items?.[0]?.downloadUrl;
    if (!url) {
      throw new BailianError(`No download URL available for ${assetId}.`, ExitCode.GENERAL);
    }

    if (settings.quiet) {
      emitBare(url);
      return;
    }

    if (format === "json") {
      emitResult({ asset_id: assetId, download_url: url }, format);
      return;
    }

    emitBare(`${padEnd("AssetId", 16)} ${assetId}`);
    emitBare(`${padEnd("DownloadUrl", 16)} ${url}`);
  },
});
