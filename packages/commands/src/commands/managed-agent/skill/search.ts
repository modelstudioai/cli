import { listRemoteSkills } from "@openagentpack/sdk";
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
import { SKILL_SEARCH_FLAGS, skillRows, type SkillSource } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "Search Managed Agent skills", "zh-CN": "搜索托管 Agent Skill" },
  auth: "apiKey",
  usageArgs: "--query <text> [--source custom|official|all] [--limit <n>] [--page-limit <n>]",
  flags: SKILL_SEARCH_FLAGS,
  exampleArgs: ["--query browser --source official", "--query report --source all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const source = (ctx.flags.source as SkillSource | undefined) ?? "custom";
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        const searchCatalog = (catalog: Exclude<SkillSource, "all">) =>
          searchCursorPages(
            async (page) => {
              const response = await listRemoteSkills(runtime, {
                provider: "bailian",
                source: catalog,
                limit: ctx.flags.limit ?? 100,
                page,
              });
              return {
                items: response.data,
                hasMore: response.has_more,
                nextPage: response.next_page,
              };
            },
            (skill) => matchesQuery(ctx.flags.query, skill.id, skill.name, skill.description),
            ctx.flags.pageLimit,
          );
        if (source !== "all") return searchCatalog(source);
        const [custom, official] = await Promise.all([
          searchCatalog("custom"),
          searchCatalog("official"),
        ]);
        return {
          items: [...custom.items, ...official.items],
          hasMore: custom.hasMore || official.hasMore,
          nextPage: undefined,
          scannedPages: custom.scannedPages + official.scannedPages,
          truncated: custom.truncated || official.truncated,
        };
      }),
    );
    emitCollection({
      format,
      key: "skills",
      items: result.items,
      headers: ["ID", "NAME", "SOURCE", "STATUS", "VERSION", "UPDATED"],
      rows: skillRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      truncated: result.truncated,
      scannedPages: result.scannedPages,
      emptyMessage: "No matching skills found.",
    });
  },
});
