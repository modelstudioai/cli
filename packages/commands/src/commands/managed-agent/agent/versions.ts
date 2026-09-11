import { listRemoteAgentVersions } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitCollection, validateLimitAndPageLimit } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { fetchAllPages } from "../_engine/pagination.ts";
import { AGENT_VERSIONS_FLAGS, agentRows } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "List Managed Agent versions", "zh-CN": "列出托管 Agent 版本" },
  auth: "apiKey",
  usageArgs: "--agent-id <id> [--limit <n>] [--page <cursor>] [--all]",
  flags: AGENT_VERSIONS_FLAGS,
  exampleArgs: ["--agent-id agent_abc", "--agent-id agent_abc --all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteAgentVersions(runtime, ctx.flags.agentId, {
              provider: "bailian",
              limit: ctx.flags.limit,
              page,
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
      key: "versions",
      items: result.items,
      headers: ["ID", "NAME", "VERSION", "TYPE", "UPDATED"],
      rows: agentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No agent versions found.",
    });
  },
});
