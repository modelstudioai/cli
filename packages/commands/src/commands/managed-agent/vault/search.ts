import { listRemoteVaults } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import {
  emitCollection,
  matchesQuery,
  searchCursorPages,
  validateLimitAndPageLimit,
} from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { VAULT_SEARCH_FLAGS, vaultRows } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "Search Managed Agent vaults", "zh-CN": "搜索托管 Agent Vault" },
  auth: "apiKey",
  usageArgs: "--query <text> [--limit <n>] [--page-limit <n>] [--include-archived]",
  flags: VAULT_SEARCH_FLAGS,
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
              provider: "bailian",
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
