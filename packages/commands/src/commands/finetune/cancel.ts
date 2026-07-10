import { defineCommand, detectOutputFormat, cancelFineTune, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const CANCEL_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: "Fine-tune job ID (required)",
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Cancel a running fine-tune job",
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: CANCEL_FLAGS,
  exampleArgs: ["--job-id ft-xxx", "--job-id ft-xxx --dry-run"],
  notes: [
    "Only PENDING / RUNNING jobs can be cancelled. Completed / failed / already-",
    "cancelled jobs return a server-side error (passed through verbatim).",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ action: "finetune.cancel", job_id: jobId }, format);
      return;
    }

    const response = await cancelFineTune(ctx.client, jobId);
    const job = response.output ?? response.data;

    if (settings.quiet) {
      emitBare(jobId);
    } else if (format === "text") {
      const status = job?.status ? ` (status=${job.status})` : "";
      emitBare(`Cancelled ${jobId}${status}.`);
    } else {
      emitResult(response, format);
    }
  },
});
