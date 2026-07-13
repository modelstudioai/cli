import {
  defineCommand,
  detectOutputFormat,
  listDeployments,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare, formatTable } from "bailian-cli-runtime";

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
    const format = detectOutputFormat(settings.output);
    const status = flags.status || undefined;

    if (settings.dryRun) {
      emitResult(
        { action: "deploy.list", page: flags.page, page_size: flags.pageSize, status },
        format,
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

    if (format === "json") {
      emitResult({ items, total }, format);
      return;
    }

    // text / quiet
    if (items.length === 0) {
      emitBare("No deployments found.");
      return;
    }
    const headers = ["DEPLOYED_MODEL", "MODEL_NAME", "STATUS", "PLAN", "CAPACITY", "CREATED_AT"];
    const rows = items.map((item) => [
      item.deployed_model,
      item.model_name,
      item.status,
      item.plan,
      item.capacity,
      item.created_at,
    ]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    if (total !== undefined) emitBare(`\nTotal: ${total}`);
  },
});
