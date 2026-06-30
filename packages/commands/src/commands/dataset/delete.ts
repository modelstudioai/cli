import {
  defineCommand,
  detectOutputFormat,
  deleteDataset,
  isInteractive,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing, promptConfirm } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Delete a dataset file by ID",
  usageArgs: "--file-id <id> [--yes]",
  options: [
    { flag: "--file-id <id>", description: "Dataset file ID (required)", required: true },
    { flag: "--yes", description: "Skip the confirmation prompt", type: "boolean" },
  ],
  exampleArgs: ["--file-id file-id-xxx", "--file-id file-id-xxx --yes"],
  async run(config: Config, flags: GlobalFlags) {
    const fileId = flags.fileId as string | undefined;
    if (!fileId) failIfMissing("file-id", "bl dataset delete --file-id <id>");

    const format = detectOutputFormat(config.output);
    const yes = Boolean(flags.yes);

    if (config.dryRun) {
      emitResult({ action: "dataset.delete", file_id: fileId }, format);
      return;
    }

    if (!yes) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const ok = await promptConfirm({
          message: `Permanently delete dataset file ${fileId}? This cannot be undone.`,
          initialValue: false,
        });
        if (!ok) {
          emitBare("Aborted.");
          return;
        }
      } else {
        throw new BailianError(
          `Refusing to delete ${fileId} without --yes in non-interactive mode.`,
          ExitCode.USAGE,
          "Pass --yes to skip the confirmation prompt.",
        );
      }
    }

    const response = await deleteDataset(config, fileId!);

    if (config.quiet || format === "text") {
      emitBare(`Deleted ${fileId}.`);
    } else {
      emitResult(response, format);
    }
  },
});
