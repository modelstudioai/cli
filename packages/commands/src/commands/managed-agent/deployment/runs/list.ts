import { listRemoteDeploymentRuns } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitCollection, validateLimitAndPageLimit } from "../../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../../_engine/config-loader.ts";
import { withStdoutProtected } from "../../_engine/console-capture.ts";
import { withAgentErrors } from "../../_engine/errors.ts";
import { fetchAllPages } from "../../_engine/pagination.ts";
import { DEPLOYMENT_RUNS_LIST_FLAGS, deploymentRunRows } from "../_shared.ts";

export default defineCommand({
  description: {
    "en-US": "List runs for a Managed Agent deployment",
    "zh-CN": "列出托管 Agent Deployment Run",
  },
  auth: "apiKey",
  usageArgs: "--deployment-id <id> [--limit <n>] [--page <cursor>] [--all]",
  flags: DEPLOYMENT_RUNS_LIST_FLAGS,
  exampleArgs: ["--deployment-id dep_abc", "--deployment-id dep_abc --all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteDeploymentRuns(runtime, ctx.flags.deploymentId, {
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
      key: "runs",
      items: result.items,
      headers: ["ID", "DEPLOYMENT", "SESSION", "STATUS", "CREATED"],
      rows: deploymentRunRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No deployment runs found.",
    });
  },
});
