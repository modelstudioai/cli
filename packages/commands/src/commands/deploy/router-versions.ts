import { defineCommand, listModelRoutingVersions, type FlagsDef } from "bailian-cli-core";

import { validateRouterVersionsPagination } from "./router-shared.ts";

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
      "en-US": "Results per page (1–1000, default: 50)",
      "zh-CN": "每页结果数（1–1000，默认：50）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "List available model-routing versions and candidates",
    "zh-CN": "列出可用的模型路由版本和候选模型",
  },
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>]",
  flags: FLAGS,
  exampleArgs: ["", "--page 1 --page-size 100"],
  notes: [
    {
      "en-US":
        "Use the returned route_model_version, supported_strategies and supported_candidate_model_ids when creating or fully replacing a router configuration.",
      "zh-CN":
        "创建路由或完整替换路由配置时，请使用返回的 route_model_version、supported_strategies 和 supported_candidate_model_ids。",
    },
  ],
  validate: validateRouterVersionsPagination,
  async run(ctx) {
    const { flags, settings } = ctx;
    const page = flags.page ?? 1;
    const pageSize = flags.pageSize ?? 50;
    if (settings.dryRun) {
      const result = { action: "deploy.router.versions", page, page_size: pageSize };
      ctx.output.result(
        result,
        settings.output === "text" ? { text: JSON.stringify(result, null, 2) } : undefined,
      );
      return;
    }
    const response = await listModelRoutingVersions(ctx.client, { pageNo: page, pageSize });
    const payload = response.output ?? response.data;
    const result = {
      items: payload?.route_model_versions ?? [],
      total: payload?.total,
      total_page: payload?.total_page,
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
