import { defineCommand, detectOutputFormat, deleteDataset, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const DELETE_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: "Dataset file ID (required)",
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Delete a dataset file by ID",
  auth: "apiKey",
  usageArgs: "--file-id <id>",
  flags: DELETE_FLAGS,
  exampleArgs: ["--file-id file-id-xxx", "--file-id file-id-xxx --dry-run"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const fileId = flags.fileId;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ action: "dataset.delete", file_id: fileId }, format);
      return;
    }

    const response = await deleteDataset(ctx.client, fileId);

    if (settings.quiet || format === "text") {
      emitBare(`Deleted ${fileId}.`);
    } else {
      emitResult(response, format);
    }
  },
});
