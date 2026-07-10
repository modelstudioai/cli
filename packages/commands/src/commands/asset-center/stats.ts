import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, padEnd } from "bailian-cli-runtime";
import type { AssetCountResponse } from "./types.ts";
import {
  ASSET_API,
  ASSET_LIST_FILTER_FLAGS,
  buildListFilterBody,
  callAssetApi,
  dryRunPayload,
} from "./utils.ts";

const STATS_FLAGS = {
  ...ASSET_LIST_FILTER_FLAGS,
  syncFailed: {
    type: "switch",
    description: "Also count assets with failed OSS sync",
  },
} satisfies FlagsDef;

/**
 * `bl asset-center stats` — 按类型统计模型生成资产数量。
 *
 * 复用 list 的筛选条件；--sync-failed 额外统计 OSS 同步失败的资产数。
 */
export default defineCommand({
  description: "Count model-generated assets by type",
  auth: "console",
  usageArgs: "[flags]",
  flags: STATS_FLAGS,
  exampleArgs: ["", "--sync-failed", "--type IMAGE --output json"],
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const body = buildListFilterBody(flags);

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.countModelGeneratedAsset, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetCountResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.countModelGeneratedAsset,
      body,
    );

    let syncFailedCount: number | undefined;
    if (flags.syncFailed) {
      const failed = await callAssetApi<AssetCountResponse>(
        ctx.client,
        settings,
        identity.binName,
        ASSET_API.countModelGeneratedAsset,
        { ...body, syncOssDataStatus: "SYNC_FAILED" },
      );
      syncFailedCount = failed.totalCount ?? 0;
    }

    if (format === "json") {
      emitResult(
        {
          total_count: data.totalCount ?? 0,
          image_count: data.imageCount ?? 0,
          video_count: data.videoCount ?? 0,
          audio_count: data.audioCount ?? 0,
          ...(syncFailedCount !== undefined ? { sync_failed_count: syncFailedCount } : {}),
        },
        format,
      );
      return;
    }

    emitBare(`${padEnd("Total", 14)} ${data.totalCount ?? 0}`);
    emitBare(`${padEnd("Image", 14)} ${data.imageCount ?? 0}`);
    emitBare(`${padEnd("Video", 14)} ${data.videoCount ?? 0}`);
    emitBare(`${padEnd("Audio", 14)} ${data.audioCount ?? 0}`);
    if (syncFailedCount !== undefined) {
      emitBare(`${padEnd("Sync failed", 14)} ${syncFailedCount}`);
    }
  },
});
