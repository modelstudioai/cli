import { defineCommand, detectOutputFormat, getFineTune, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, emitRequestId } from "bailian-cli-runtime";

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
    const { identity, settings, flags } = ctx;
    const jobId = flags.jobId;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ action: "finetune.get", job_id: jobId }, format);
      return;
    }

    const response = await getFineTune(ctx.client, jobId);
    const job = response.output ?? response.data;

    if (!job) {
      emitBare(`No data returned for ${jobId}`);
      return;
    }

    const hp = job.hyper_parameters;
    const hyperParts: string[] = [];
    if (hp?.n_epochs !== undefined) hyperParts.push(`n_epochs=${hp.n_epochs}`);
    if (hp?.batch_size !== undefined) hyperParts.push(`batch_size=${hp.batch_size}`);
    if (hp?.learning_rate !== undefined) hyperParts.push(`learning_rate=${hp.learning_rate}`);
    if (hp?.max_length !== undefined) hyperParts.push(`max_length=${hp.max_length}`);

    const item = {
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
    };

    if (format === "json") {
      emitResult({ ...item, request_id: response.request_id }, format);
      return;
    }

    // text / quiet
    emitBare(`job_id:           ${item.job_id}`);
    if (item.base_model) emitBare(`base_model:       ${item.base_model}`);
    if (item.status) emitBare(`status:           ${item.status}`);
    if (item.training_type) emitBare(`training_type:    ${item.training_type}`);
    if (item.training_files.length) emitBare(`training_files:   ${item.training_files.join(", ")}`);
    if (item.validation_files.length)
      emitBare(`validation_files: ${item.validation_files.join(", ")}`);
    if (item.hyper_params) emitBare(`hyper_params:     ${item.hyper_params}`);
    if (item.output_model)
      emitBare(
        `output_model:     ${item.output_model}  (→ ${identity.binName} deploy text create --model)`,
      );
    if (item.model_name) emitBare(`model_name:       ${item.model_name}`);
    if (item.created_at) emitBare(`created_at:       ${item.created_at}`);
    if (item.updated_at) emitBare(`updated_at:       ${item.updated_at}`);
    emitRequestId(response.request_id, settings.quiet);
  },
});
