import { listRemoteAgents } from "@openagentpack/sdk";
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
import { AGENT_SEARCH_FLAGS, agentRows } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "Search Managed Agents", "zh-CN": "搜索托管 Agent" },
  auth: "apiKey",
  usageArgs: "--query <text> [--limit <n>] [--page-limit <n>] [--include-archived]",
  flags: AGENT_SEARCH_FLAGS,
  exampleArgs: ["--query assistant", "--query code --page-limit 20 --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return searchCursorPages(
          async (page) => {
            const response = await listRemoteAgents(runtime, {
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
          (agent) => matchesQuery(ctx.flags.query, agent.id, agent.name, agent.description),
          ctx.flags.pageLimit,
        );
      }),
    );
    emitCollection({
      format,
      key: "agents",
      items: result.items,
      headers: ["ID", "NAME", "VERSION", "TYPE", "UPDATED"],
      rows: agentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      truncated: result.truncated,
      scannedPages: result.scannedPages,
      emptyMessage: "No matching agents found.",
    });
  },
});
