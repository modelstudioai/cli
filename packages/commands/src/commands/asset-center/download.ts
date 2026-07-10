import {
  defineCommand,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { downloadFile, emitResult, emitBare, formatBytes } from "bailian-cli-runtime";
import type { AssetDownloadResponse } from "./types.ts";
import { ASSET_API, callAssetApi, dryRunPayload } from "./utils.ts";

const DOWNLOAD_FLAGS = {
  id: {
    type: "string",
    valueHint: "<asset-id>",
    description: "Asset ID to download",
    required: true,
  },
  out: {
    type: "string",
    valueHint: "<path>",
    description: "Output file path",
    required: true,
  },
} satisfies FlagsDef;

/**
 * `bl asset-center download` — 下载单个资产到本地文件。
 *
 * 通过 batchGetAssetDownloadUrl 获取签名 URL，再写入 --out 指定路径。
 */
export default defineCommand({
  description: "Download an asset by ID to a local file",
  auth: "console",
  usageArgs: "--id <asset-id> --out <path>",
  flags: DOWNLOAD_FLAGS,
  exampleArgs: ["--id asset-001 --out ./image.png", "--id asset-001 --out ./image.png --quiet"],
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const assetId = flags.id;
    const outPath = flags.out;
    const body = { assetIdList: [assetId] };

    if (settings.dryRun) {
      emitResult(
        {
          asset_id: assetId,
          action: "download",
          out: outPath,
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

    const { size } = await downloadFile(url, outPath, { quiet: settings.quiet });

    if (settings.quiet) {
      emitBare(outPath);
      return;
    }

    emitResult({ saved: outPath, size: formatBytes(size) }, format);
  },
});
