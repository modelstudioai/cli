import { listRemoteDeployments } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitCollection, validateLimitAndPageLimit } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { fetchAllPages } from "../_engine/pagination.ts";
import { DEPLOYMENT_LIST_FLAGS, deploymentRows } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "List Managed Agent deployments", "zh-CN": "列出托管 Agent Deployment" },
  auth: "apiKey",
  usageArgs: "[--agent-id <id>] [--status active|paused] [--limit <n>] [--page <cursor>] [--all]",
  flags: DEPLOYMENT_LIST_FLAGS,
  exampleArgs: ["", "--status active --all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteDeployments(runtime, {
              provider: "bailian",
              agent_id: ctx.flags.agentId,
              status: ctx.flags.status,
              include_archived: ctx.flags.includeArchived,
              created_at_gte: ctx.flags.createdAtGte,
              created_at_lte: ctx.flags.createdAtLte,
              limit: ctx.flags.limit,
              page,
            });
            return {
              items: response.deployments,
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
      key: "deployments",
      items: result.items,
      headers: ["ID", "STATUS", "SCHEDULE", "PAUSED REASON"],
      rows: deploymentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No deployments found.",
    });
  },
});
