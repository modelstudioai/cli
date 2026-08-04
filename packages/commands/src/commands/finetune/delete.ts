import { defineCommand, detectOutputFormat, deleteFineTune, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, emitRequestId } from "bailian-cli-runtime";

const DELETE_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: "Fine-tune job ID (required)",
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Delete a fine-tune job record",
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: DELETE_FLAGS,
  exampleArgs: ["--job-id ft-xxx", "--job-id ft-xxx --dry-run"],
  notes: [
    "Cancel a RUNNING job first via `finetune cancel` — the platform refuses",
    "to delete jobs that are still in flight.",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ action: "finetune.delete", job_id: jobId }, format);
      return;
    }

    const response = await deleteFineTune(ctx.client, jobId);

    if (settings.quiet) {
      emitBare(jobId);
    } else if (format === "text") {
      emitBare(`Deleted ${jobId}.`);
      emitRequestId(response.request_id, settings.quiet);
    } else {
      emitResult(response, format);
    }
  },
});
