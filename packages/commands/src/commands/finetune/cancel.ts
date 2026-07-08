import {
  defineCommand,
  detectOutputFormat,
  cancelFineTune,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const CANCEL_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: "Fine-tune job ID (required)",
    required: true,
  },
  yes: { type: "switch", description: "Confirm the cancellation (required to cancel)" },
} satisfies FlagsDef;

export default defineCommand({
  description: "Cancel a running fine-tune job",
  auth: "apiKey",
  usageArgs: "--job-id <id> --yes",
  flags: CANCEL_FLAGS,
  exampleArgs: ["--job-id ft-xxx --yes", "--job-id ft-xxx --dry-run"],
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

    if (!flags.yes) {
      throw new BailianError(
        `Refusing to cancel fine-tune job ${jobId} without --yes.`,
        ExitCode.USAGE,
        "Pass --yes to confirm the cancellation.",
      );
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
