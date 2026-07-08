import {
  defineCommand,
  detectOutputFormat,
  deleteFineTune,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const DELETE_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: "Fine-tune job ID (required)",
    required: true,
  },
  yes: { type: "switch", description: "Confirm the deletion (required to delete)" },
} satisfies FlagsDef;

export default defineCommand({
  description: "Delete a fine-tune job record",
  auth: "apiKey",
  usageArgs: "--job-id <id> --yes",
  flags: DELETE_FLAGS,
  exampleArgs: ["--job-id ft-xxx --yes", "--job-id ft-xxx --dry-run"],
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

    if (!flags.yes) {
      throw new BailianError(
        `Refusing to permanently delete fine-tune job ${jobId} without --yes.`,
        ExitCode.USAGE,
        "Pass --yes to confirm the deletion.",
      );
    }

    const response = await deleteFineTune(ctx.client, jobId);

    if (settings.quiet) {
      emitBare(jobId);
    } else if (format === "text") {
      emitBare(`Deleted ${jobId}.`);
    } else {
      emitResult(response, format);
    }
  },
});
