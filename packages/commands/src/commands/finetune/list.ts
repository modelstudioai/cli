import { defineCommand, listFineTunes, type FlagsDef } from "bailian-cli-core";
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
      "en-US": "Filter by status (PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED)",
      "zh-CN": "按状态筛选（PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED）",
    },
  },
  baseModel: {
    type: "string",
    valueHint: "<model>",
    description: "Filter by base model ID (server-side)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "List fine-tune jobs", "zh-CN": "列出微调任务" },
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>] [--status <s>] [--base-model <model>]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--status RUNNING", "--base-model qwen3-8b", "--page-size 20"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const pageNo = flags.page;
    const pageSize = flags.pageSize;
    const status = flags.status || undefined;
    const model = flags.baseModel || undefined;

    if (settings.dryRun) {
      emitResult(
        { action: "finetune.list", page: pageNo, page_size: pageSize, status, model },
        "json",
      );
      return;
    }

    const response = await listFineTunes(ctx.client, { pageNo, pageSize, status, model });
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
