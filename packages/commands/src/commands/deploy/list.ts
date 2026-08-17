import { defineCommand, listDeployments, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const LIST_FLAGS = {
  page: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: "Results per page (default: 10, max 100)",
  },
  status: {
    type: "string",
    valueHint: "<s>",
    description: "Filter by status (PENDING / RUNNING / STOPPED / FAILED)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "List model deployments",
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
