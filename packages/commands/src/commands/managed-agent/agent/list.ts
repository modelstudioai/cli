import { listRemoteAgents } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitCollection, validateLimitAndPageLimit } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { fetchAllPages } from "../_engine/pagination.ts";
import { AGENT_LIST_FLAGS, agentRows } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "List Managed Agents", "zh-CN": "列出托管 Agent" },
  auth: "apiKey",
  usageArgs: "[--limit <n>] [--page <cursor>] [--all] [--include-archived] [--file <path>]",
  flags: AGENT_LIST_FLAGS,
  exampleArgs: ["", "--limit 50", "--all --include-archived --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteAgents(runtime, {
              provider: "bailian",
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
      key: "agents",
      items: result.items,
      headers: ["ID", "NAME", "VERSION", "TYPE", "UPDATED"],
      rows: agentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No agents found.",
    });
  },
});
