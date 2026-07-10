import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, formatTable } from "bailian-cli-runtime";
import type { AssetListResponse, ModelGeneratedAssetItem } from "./types.ts";
import { ASSET_API, callAssetApi, dryRunPayload, formatGenerateTime } from "./utils.ts";

const TRANSFER_LIST_FLAGS = {
  status: {
    type: "string",
    valueHint: "<status>",
    description: "OSS sync status filter",
    choices: ["NOT_SYNCED", "IN_SYNCING", "SYNC_SUCCESS", "SYNC_FAILED"] as const,
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: "Results per page (default: 10, max: 100)",
  },
  nextToken: {
    type: "number",
    valueHint: "<token>",
    description: "Cursor for the next page",
  },
} satisfies FlagsDef;

function normalizeItem(item: ModelGeneratedAssetItem) {
  return {
    asset_id: item.assetId ?? "",
    asset_type: item.assetType ?? "",
    asset_name: item.assetName ?? "",
    sync_status: item.syncOssDataStatus ?? "",
    generate_time: item.generateTime,
  };
}

/**
 * `bl asset-center transfer list` — 按 OSS 同步状态查看转存记录。
 *
 * 后端尚无独立转存日志 API，复用 listModelGeneratedAsset 并按 syncOssDataStatus
 * 过滤（默认 SYNC_FAILED）。
 */
export default defineCommand({
  description: "List asset OSS transfer records (filtered by sync status)",
  auth: "console",
  usageArgs: "[--status <status>] [flags]",
  flags: TRANSFER_LIST_FLAGS,
  exampleArgs: ["", "--status SYNC_FAILED", "--status IN_SYNCING --page-size 20 --output json"],
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const syncStatus = flags.status ?? "SYNC_FAILED";

    const body: Record<string, unknown> = {
      deleteStatus: "NORMAL",
      syncOssDataStatus: syncStatus,
      pageSize: flags.pageSize ?? 10,
    };
    if (flags.nextToken !== undefined) body.nextToken = flags.nextToken;

    if (settings.dryRun) {
      emitResult(
        dryRunPayload(settings, identity.binName, ASSET_API.listModelGeneratedAsset, body),
        format,
      );
      return;
    }

    const data = await callAssetApi<AssetListResponse>(
      ctx.client,
      settings,
      identity.binName,
      ASSET_API.listModelGeneratedAsset,
      body,
    );

    const items = (data.dataList ?? []).map(normalizeItem);

    if (format === "json") {
      emitResult(
        {
          items,
          sync_status: syncStatus,
          next_token: data.nextToken,
          has_next: data.hasNext,
        },
        format,
      );
      return;
    }

    if (items.length === 0) {
      emitBare(`No transfer records with status ${syncStatus}.`);
      return;
    }

    const headers = ["ASSET_ID", "TYPE", "NAME", "SYNC_STATUS", "GENERATED"];
    const rows = items.map((item) => [
      item.asset_id,
      item.asset_type,
      item.asset_name,
      item.sync_status,
      formatGenerateTime(item.generate_time),
    ]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    if (data.hasNext) emitBare(`\nnext token: ${data.nextToken}`);
  },
});
