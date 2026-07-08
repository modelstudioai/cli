import {
  defineCommand,
  detectOutputFormat,
  deleteDataset,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const DELETE_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: "Dataset file ID (required)",
    required: true,
  },
  yes: { type: "switch", description: "Confirm the deletion (required to delete)" },
} satisfies FlagsDef;

export default defineCommand({
  description: "Delete a dataset file by ID",
  auth: "apiKey",
  usageArgs: "--file-id <id> --yes",
  flags: DELETE_FLAGS,
  exampleArgs: ["--file-id file-id-xxx --yes", "--file-id file-id-xxx --dry-run"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const fileId = flags.fileId;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ action: "dataset.delete", file_id: fileId }, format);
      return;
    }

    if (!flags.yes) {
      throw new BailianError(
        `Refusing to permanently delete ${fileId} without --yes.`,
        ExitCode.USAGE,
        "Pass --yes to confirm the deletion.",
      );
    }

    const response = await deleteDataset(ctx.client, fileId);

    if (settings.quiet || format === "text") {
      emitBare(`Deleted ${fileId}.`);
    } else {
      emitResult(response, format);
    }
  },
});
