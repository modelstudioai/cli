import { defineCommand, getFineTune, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { computeActualFee } from "./fee.ts";

const GET_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Fine-tune job ID (required)", "zh-CN": "微调任务 ID（必填）" },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Get details of a single fine-tune job",
    "zh-CN": "获取单个微调任务的详情",
  },
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--job-id ft-xxx", "--job-id ft-xxx --output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;

    if (settings.dryRun) {
      emitResult({ action: "finetune.get", job_id: jobId }, "json");
      return;
    }

    const response = await getFineTune(ctx.client, jobId);
    const job = response.output ?? response.data;

    if (!job) {
      emitResult({ job_id: jobId, error: "No data returned" }, "json");
      return;
    }

    const hyperParameters = job.hyper_parameters;
    const hyperParts: string[] = [];
    if (hyperParameters?.n_epochs !== undefined)
      hyperParts.push(`n_epochs=${hyperParameters.n_epochs}`);
    if (hyperParameters?.batch_size !== undefined)
      hyperParts.push(`batch_size=${hyperParameters.batch_size}`);
    if (hyperParameters?.learning_rate !== undefined)
      hyperParts.push(`learning_rate=${hyperParameters.learning_rate}`);
    if (hyperParameters?.max_length !== undefined)
      hyperParts.push(`max_length=${hyperParameters.max_length}`);

    const usageTokens = typeof job.usage === "number" ? job.usage : undefined;

    const item: Record<string, unknown> = {
      job_id: job.job_id ?? jobId,
      base_model: job.model ?? "",
      status: job.status ?? "",
      training_type: job.training_type ?? "",
      training_files: job.training_file_ids ?? [],
      validation_files: job.validation_file_ids ?? [],
      hyper_params: hyperParts.length ? hyperParts.join(" · ") : "",
      output_model: job.finetuned_output ?? "",
      model_name: job.model_name ?? "",
      created_at: job.create_time ?? job.gmt_create ?? "",
      updated_at: job.end_time ?? job.gmt_modified ?? "",
      usage_tokens: usageTokens ?? "",
      charge_type: typeof job.charge_type === "string" ? job.charge_type : "",
    };

    // Actual fee: only when the platform reports a concrete token count
    // (SUCCEEDED / CANCELED). Best-effort — silently omitted on lookup failure.
    if (usageTokens !== undefined && usageTokens > 0 && job.model) {
      const fee = await computeActualFee(settings, job.model, usageTokens);
      if (fee) {
        item.training_cost = fee.cost;
        item.cost_basis = `${fee.unitPrice} 元/${fee.priceUnit}`;
      }
    }

    emitResult({ ...item, request_id: response.request_id }, "json");
  },
});
