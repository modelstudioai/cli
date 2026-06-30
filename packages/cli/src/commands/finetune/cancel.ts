import {
  defineCommand,
  detectOutputFormat,
  cancelFineTune,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing, promptConfirm } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "finetune cancel",
  description: "Cancel a running fine-tune job",
  usage: "bl finetune cancel --job-id <id> [--yes]",
  options: [
    { flag: "--job-id <id>", description: "Fine-tune job ID (required)", required: true },
    { flag: "--yes", description: "Skip the confirmation prompt", type: "boolean" },
  ],
  examples: ["bl finetune cancel --job-id ft-xxx", "bl finetune cancel --job-id ft-xxx --yes"],
  notes: [
    "Only PENDING / RUNNING jobs can be cancelled. Completed / failed / already-",
    "cancelled jobs return a server-side error (passed through verbatim).",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const jobId = flags.jobId as string | undefined;
    if (!jobId) failIfMissing("job-id", "bl finetune cancel --job-id <id>");

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ action: "finetune.cancel", job_id: jobId }, format);
      return;
    }

    if (!flags.yes && !config.nonInteractive && !config.quiet) {
      process.stderr.write(`Cancel fine-tune job ${jobId}?\n`);
      const ok = await promptConfirm({ message: "Proceed?", initialValue: false });
      if (!ok) {
        emitBare("Cancelled.");
        return;
      }
    } else if (!flags.yes && config.nonInteractive) {
      throw new BailianError(
        "Pass --yes to confirm cancellation in non-interactive mode.",
        ExitCode.USAGE,
      );
    }

    const response = await cancelFineTune(config, jobId!);
    const job = response.output ?? response.data;

    if (config.quiet) {
      emitBare(jobId!);
    } else if (format === "text") {
      const status = job?.status ? ` (status=${job.status})` : "";
      emitBare(`Cancelled ${jobId}${status}.`);
    } else {
      emitResult(response, format);
    }
  },
});
