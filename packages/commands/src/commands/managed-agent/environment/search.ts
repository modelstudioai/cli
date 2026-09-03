import { listRemoteEnvironments } from "@openagentpack/sdk";
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
import { ENVIRONMENT_SEARCH_FLAGS, environmentRows } from "./_shared.ts";

export default defineCommand({
  description: {
    "en-US": "Search Managed Agent environments",
    "zh-CN": "搜索托管 Agent 环境",
  },
  auth: "apiKey",
  usageArgs: "--query <text> [--limit <n>] [--page-limit <n>] [--include-archived]",
  flags: ENVIRONMENT_SEARCH_FLAGS,
  exampleArgs: ["--query sandbox", "--query production --page-limit 20 --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return searchCursorPages(
          async (page) => {
            const response = await listRemoteEnvironments(runtime, {
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
          (environment) =>
            matchesQuery(
              ctx.flags.query,
              environment.id,
              environment.name,
              environment.description,
            ),
          ctx.flags.pageLimit,
        );
      }),
    );
    emitCollection({
      format,
      key: "environments",
      items: result.items,
      headers: ["ID", "NAME", "SCOPE", "VERSION", "UPDATED"],
      rows: environmentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      truncated: result.truncated,
      scannedPages: result.scannedPages,
      emptyMessage: "No matching environments found.",
    });
  },
});
