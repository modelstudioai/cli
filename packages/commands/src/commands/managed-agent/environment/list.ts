import { listRemoteEnvironments } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitCollection, validateLimitAndPageLimit } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { fetchAllPages } from "../_engine/pagination.ts";
import { ENVIRONMENT_LIST_FLAGS, environmentRows } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "List Managed Agent environments", "zh-CN": "列出托管 Agent 环境" },
  auth: "apiKey",
  usageArgs: "[--limit <n>] [--page <cursor>] [--all] [--include-archived]",
  flags: ENVIRONMENT_LIST_FLAGS,
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
            const response = await listRemoteEnvironments(runtime, {
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
      key: "environments",
      items: result.items,
      headers: ["ID", "NAME", "SCOPE", "VERSION", "UPDATED"],
      rows: environmentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No environments found.",
    });
  },
});
