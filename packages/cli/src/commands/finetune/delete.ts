import {
  defineCommand,
  detectOutputFormat,
  deleteFineTune,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing, promptConfirm } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "finetune delete",
  description: "Delete a fine-tune job record",
  usage: "bl finetune delete --job-id <id> [--yes]",
  options: [
    { flag: "--job-id <id>", description: "Fine-tune job ID (required)", required: true },
    { flag: "--yes", description: "Skip the confirmation prompt", type: "boolean" },
  ],
  examples: ["bl finetune delete --job-id ft-xxx", "bl finetune delete --job-id ft-xxx --yes"],
  notes: [
    "Cancel a RUNNING job first via `bl finetune cancel` — the platform refuses",
    "to delete jobs that are still in flight.",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const jobId = flags.jobId as string | undefined;
    if (!jobId) failIfMissing("job-id", "bl finetune delete --job-id <id>");

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ action: "finetune.delete", job_id: jobId }, format);
      return;
    }

    if (!flags.yes && !config.nonInteractive && !config.quiet) {
      process.stderr.write(`Permanently delete fine-tune job ${jobId}?\n`);
      const ok = await promptConfirm({ message: "Proceed?", initialValue: false });
      if (!ok) {
        emitBare("Cancelled.");
        return;
      }
    } else if (!flags.yes && config.nonInteractive) {
      throw new BailianError(
        "Pass --yes to confirm deletion in non-interactive mode.",
        ExitCode.USAGE,
      );
    }

    const response = await deleteFineTune(config, jobId!);

    if (config.quiet) {
      emitBare(jobId!);
    } else if (format === "text") {
      emitBare(`Deleted ${jobId}.`);
    } else {
      emitResult(response, format);
    }
  },
});
