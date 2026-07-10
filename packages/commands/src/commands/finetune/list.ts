import { defineCommand, detectOutputFormat, listFineTunes, type FlagsDef } from "bailian-cli-core";
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
    const { identity, settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const pageNo = flags.page;
    const pageSize = flags.pageSize;
    const status = flags.status || undefined;

    if (settings.dryRun) {
      emitResult({ action: "finetune.list", page: pageNo, page_size: pageSize, status }, format);
      return;
    }

    const response = await listFineTunes(ctx.client, { pageNo, pageSize, status });
    const payload = response.output ?? response.data;
    const jobs = payload?.jobs ?? [];
    const total = payload?.total;

    const items = jobs.map((item) => ({
      job_id: item.job_id ?? "",
      base_model: item.model ?? "",
      status: item.status ?? "",
      training_type: item.training_type ?? "",
      output_model: item.finetuned_output ?? "",
      created_at: item.create_time ?? item.gmt_create ?? "",
    }));

    if (format === "json") {
      emitResult({ items, total }, format);
      return;
    }

    // text / quiet
    if (items.length === 0) {
      emitBare("No fine-tune jobs found.");
      return;
    }
    const headers = [
      "JOB_ID",
      "BASE_MODEL",
      "STATUS",
      "TRAINING_TYPE",
      "OUTPUT_MODEL",
      "CREATED_AT",
    ];
    const rows = items.map((i) => [
      i.job_id,
      i.base_model,
      i.status,
      i.training_type,
      i.output_model,
      i.created_at,
    ]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    if (total !== undefined) emitBare(`\nTotal: ${total}`);
    emitBare(
      `Tip: OUTPUT_MODEL is the input for \`${identity.binName} deploy text create --model\``,
    );
  },
});
