import { defineCommand, listFineTunes, type FlagsDef } from "bailian-cli-core";
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
    description: "Filter by status (PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "List fine-tune jobs",
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>] [--status <s>]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--status RUNNING", "--page-size 20 --output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const pageNo = flags.page;
    const pageSize = flags.pageSize;
    const status = flags.status || undefined;

    if (settings.dryRun) {
      emitResult({ action: "finetune.list", page: pageNo, page_size: pageSize, status }, "json");
      return;
    }

    const response = await listFineTunes(ctx.client, { pageNo, pageSize, status });
    const payload = response.output ?? response.data;
    const jobs = payload?.jobs ?? [];
    const total = payload?.total;

    const items = jobs.map((job) => ({
      job_id: job.job_id ?? "",
      base_model: job.model ?? "",
      status: job.status ?? "",
      training_type: job.training_type ?? "",
      output_model: job.finetuned_output ?? "",
      created_at: job.create_time ?? job.gmt_create ?? "",
    }));

    emitResult({ items, total, request_id: response.request_id }, "json");
  },
});
