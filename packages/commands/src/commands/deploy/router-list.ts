import { defineCommand, listDeployments, type FlagsDef } from "bailian-cli-core";

import { validateRouterListPagination } from "./router-shared.ts";

const FLAGS = {
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Results per page (1–100, default: 10)",
      "zh-CN": "每页结果数（1–100，默认：10）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "List model routers", "zh-CN": "列出模型路由" },
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>]",
  flags: FLAGS,
  exampleArgs: ["", "--page 2 --page-size 20"],
  notes: [
    {
      "en-US": "This command always requests plan=mr and does not expose a plan override.",
      "zh-CN": "本命令固定请求 plan=mr，不提供方案覆盖选项。",
    },
  ],
  validate: validateRouterListPagination,
  async run(ctx) {
    const { flags, settings } = ctx;
    const page = flags.page ?? 1;
    const pageSize = flags.pageSize ?? 10;
    if (settings.dryRun) {
      const result = { action: "deploy.router.list", page, page_size: pageSize, plan: "mr" };
      ctx.output.result(
        result,
        settings.output === "text" ? { text: JSON.stringify(result, null, 2) } : undefined,
      );
      return;
    }
    const response = await listDeployments(ctx.client, { pageNo: page, pageSize, plan: "mr" });
    const payload = response.output ?? response.data;
    const result = {
      items: payload?.deployments ?? [],
      total: payload?.total,
      page_no: payload?.page_no ?? page,
      page_size: payload?.page_size ?? pageSize,
      request_id: response.request_id,
    };
    ctx.output.result(
      result,
      settings.output === "text" ? { text: JSON.stringify(result, null, 2) } : undefined,
    );
  },
});
