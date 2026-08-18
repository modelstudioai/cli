import { defineCommand, listDeployments, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const LIST_FLAGS = {
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Results per page (default: 10, max 100)",
      "zh-CN": "每页结果数（默认：10，最多：100）",
    },
  },
  status: {
    type: "string",
    valueHint: "<s>",
    description: {
      "en-US": "Filter by status (PENDING / RUNNING / STOPPED / FAILED)",
      "zh-CN": "按状态筛选（PENDING / RUNNING / STOPPED / FAILED）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "List model deployments", "zh-CN": "列出模型部署" },
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>] [--status <s>]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--status RUNNING", "--page-size 20 --output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const status = flags.status || undefined;

    if (settings.dryRun) {
      emitResult(
        { action: "deploy.list", page: flags.page, page_size: flags.pageSize, status },
        "json",
      );
      return;
    }

    const response = await listDeployments(ctx.client, {
      pageNo: flags.page,
      pageSize: flags.pageSize,
      status,
    });
    const payload = response.output ?? response.data;
    const deployments = payload?.deployments ?? [];
    const total = payload?.total;

    const items = deployments.map((item) => ({
      deployed_model: item.deployed_model ?? "",
      model_name: item.model_name ?? "",
      status: item.status ?? "",
      plan: item.plan ?? "",
      capacity: item.capacity !== undefined ? String(item.capacity) : "",
      created_at: item.gmt_create ?? "",
    }));

    emitResult({ items, total, request_id: response.request_id }, "json");
  },
});
