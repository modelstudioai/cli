import {
  defineCommand,
  detectOutputFormat,
  listDeployments,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { formatTable } from "bailian-cli-runtime";

export default defineCommand({
  description: "List model deployments",
  usageArgs: "[--page <n>] [--page-size <n>] [--status <s>]",
  options: [
    { flag: "--page <n>", description: "Page number (default: 1)", type: "number" },
    {
      flag: "--page-size <n>",
      description: "Results per page (default: 10, max 100)",
      type: "number",
    },
    {
      flag: "--status <s>",
      description: "Filter by status (PENDING / RUNNING / STOPPED / FAILED)",
    },
  ],
  exampleArgs: ["", "--status RUNNING", "--page-size 20 --output json"],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const pageNo = flags.page !== undefined ? (flags.page as number) : undefined;
    const pageSize = flags.pageSize !== undefined ? (flags.pageSize as number) : undefined;
    const status = (flags.status as string | undefined) || undefined;

    if (config.dryRun) {
      emitResult({ action: "deploy.list", page: pageNo, page_size: pageSize, status }, format);
      return;
    }

    const response = await listDeployments(config, { pageNo, pageSize, status });
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
    const rows = items.map((i) => [
      i.deployed_model,
      i.model_name,
      i.status,
      i.plan,
      i.capacity,
      i.created_at,
    ]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    if (total !== undefined) emitBare(`\nTotal: ${total}`);
  },
});
