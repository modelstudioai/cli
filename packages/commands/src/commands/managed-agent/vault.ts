import type { CloudVault } from "@openagentpack/sdk";
import { getRemoteVault, listRemoteVaults } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  emitCollection,
  INCLUDE_ARCHIVED_FLAG,
  matchesQuery,
  SEARCH_FLAGS,
  searchCursorPages,
  validateLimitAndPageLimit,
} from "./_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { fetchAllPages } from "./_engine/pagination.ts";

const LIST_FLAGS = { ...API_TARGET_FLAGS, ...CURSOR_FLAGS, ...INCLUDE_ARCHIVED_FLAG };
const SEARCH_RESOURCE_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};
const GET_FLAGS = {
  ...API_TARGET_FLAGS,
  vaultId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Vault ID", "zh-CN": "Vault ID" },
  },
} as const;

function vaultRows(vaults: CloudVault[]): string[][] {
  return vaults.map((vault) => [
    vault.id,
    displayValue(vault.display_name),
    displayValue(vault.type),
    displayValue(vault.created_at),
    displayValue(vault.updated_at),
  ]);
}

export const managedAgentVaultList = defineCommand({
  description: { "en-US": "List Managed Agent vaults", "zh-CN": "列出托管 Agent Vault" },
  auth: "apiKey",
  usageArgs: "[--limit <n>] [--page <cursor>] [--all] [--include-archived]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteVaults(runtime, {
              provider: ctx.flags.provider,
              limit: ctx.flags.limit,
              page,
              include_archived: ctx.flags.includeArchived,
            });
            return {
              items: response.data,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          ctx.flags.all,
          ctx.flags.page,
        );
      }),
    );
    emitCollection({
      format,
      key: "vaults",
      items: result.items,
      headers: ["ID", "NAME", "TYPE", "CREATED", "UPDATED"],
      rows: vaultRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No vaults found.",
    });
  },
});

export const managedAgentVaultGet = defineCommand({
  description: { "en-US": "Get a Managed Agent vault", "zh-CN": "获取托管 Agent Vault 详情" },
  auth: "apiKey",
  usageArgs: "--vault-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--vault-id vault_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const vault = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteVault(runtime, ctx.flags.vaultId, { provider: ctx.flags.provider });
      }),
    );
    if (format === "json") {
      emitResult(vault, format);
      return;
    }
    emitBare(`ID:      ${vault.id}`);
    emitBare(`Name:    ${displayValue(vault.display_name)}`);
    emitBare(`Type:    ${displayValue(vault.type)}`);
    emitBare(`Created: ${displayValue(vault.created_at)}`);
    emitBare(`Updated: ${displayValue(vault.updated_at)}`);
  },
});

export const managedAgentVaultSearch = defineCommand({
  description: { "en-US": "Search Managed Agent vaults", "zh-CN": "搜索托管 Agent Vault" },
  auth: "apiKey",
  usageArgs: "--query <text> [--limit <n>] [--page-limit <n>] [--include-archived]",
  flags: SEARCH_RESOURCE_FLAGS,
  exampleArgs: ["--query github", "--query production --page-limit 20 --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return searchCursorPages(
          async (page) => {
            const response = await listRemoteVaults(runtime, {
              provider: ctx.flags.provider,
              limit: ctx.flags.limit ?? 100,
              page,
              include_archived: ctx.flags.includeArchived,
            });
            return {
              items: response.data,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          (vault) => matchesQuery(ctx.flags.query, vault.id, vault.display_name, vault.metadata),
          ctx.flags.pageLimit,
        );
      }),
    );
    emitCollection({
      format,
      key: "vaults",
      items: result.items,
      headers: ["ID", "NAME", "TYPE", "CREATED", "UPDATED"],
      rows: vaultRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      truncated: result.truncated,
      scannedPages: result.scannedPages,
      emptyMessage: "No matching vaults found.",
    });
  },
});
