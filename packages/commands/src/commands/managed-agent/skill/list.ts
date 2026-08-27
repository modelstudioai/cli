import { listRemoteSkills } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitCollection, validateLimitAndPageLimit } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { fetchAllPages } from "../_engine/pagination.ts";
import { SKILL_LIST_FLAGS, skillRows, type SkillSource } from "./_shared.ts";

async function listOneCatalog(
  runtime: Parameters<typeof listRemoteSkills>[0],
  source: Exclude<SkillSource, "all">,
  options: { provider?: string; limit?: number; page?: string; all?: boolean },
) {
  return fetchAllPages(
    async (page) => {
      const response = await listRemoteSkills(runtime, {
        provider: options.provider,
        source,
        limit: options.limit,
        page,
      });
      return { items: response.data, hasMore: response.has_more, nextPage: response.next_page };
    },
    options.all,
    options.page,
  );
}

export default defineCommand({
  description: { "en-US": "List Managed Agent skills", "zh-CN": "列出托管 Agent Skill" },
  auth: "apiKey",
  usageArgs: "[--source custom|official|all] [--limit <n>] [--page <cursor>] [--all]",
  flags: SKILL_LIST_FLAGS,
  exampleArgs: ["", "--source official", "--source all --all --output json"],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US":
        "--source all combines one page from each catalog, or every page with --all; it does not accept --page.",
      "zh-CN":
        "--source all 默认合并两个 Catalog 的各一页，传入 --all 时获取全部分页；该模式不接受 --page。",
    },
  ],
  validate: (flags) =>
    validateLimitAndPageLimit(flags) ??
    (flags.source === "all" && flags.page
      ? "--source all cannot be combined with --page."
      : undefined),
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const source = (ctx.flags.source as SkillSource | undefined) ?? "custom";
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        if (source !== "all") {
          return listOneCatalog(runtime, source, {
            provider: ctx.flags.provider,
            limit: ctx.flags.limit,
            page: ctx.flags.page,
            all: ctx.flags.all,
          });
        }
        const [custom, official] = await Promise.all([
          listOneCatalog(runtime, "custom", {
            provider: ctx.flags.provider,
            limit: ctx.flags.limit,
            all: ctx.flags.all,
          }),
          listOneCatalog(runtime, "official", {
            provider: ctx.flags.provider,
            limit: ctx.flags.limit,
            all: ctx.flags.all,
          }),
        ]);
        return {
          items: [...custom.items, ...official.items],
          hasMore: custom.hasMore || official.hasMore,
          nextPage: undefined,
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
      emptyMessage: "No skills found.",
    });
  },
});
