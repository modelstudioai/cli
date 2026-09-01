import { defineCommand, deleteDataset, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, confirmDangerousAction } from "bailian-cli-runtime";

const DELETE_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Dataset file ID (required)", "zh-CN": "数据集文件 ID（必填）" },
    required: true,
  },
  yes: {
    type: "switch",
    description: { "en-US": "Skip the confirmation prompt", "zh-CN": "跳过确认提示" },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Delete a dataset file by ID", "zh-CN": "通过 ID 删除数据集文件" },
  auth: "apiKey",
  usageArgs: "--file-id <id> [--yes]",
  flags: DELETE_FLAGS,
  exampleArgs: [
    "--file-id file-id-xxx",
    "--file-id file-id-xxx --dry-run",
    "--file-id file-id-xxx --yes",
  ],
  notes: [
    {
      "en-US": "Irreversible — the dataset file is permanently removed.",
      "zh-CN": "该操作不可撤销——数据集文件将被永久删除。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const fileId = flags.fileId;

    if (settings.dryRun) {
      emitResult({ action: "dataset.delete", file_id: fileId }, "json");
      return;
    }

    await confirmDangerousAction(
      `Delete dataset file ${fileId}.\nThe file is permanently removed. This cannot be undone.`,
      flags.yes ?? false,
    );

    const response = await deleteDataset(ctx.client, fileId);

    if (settings.quiet) {
      emitBare(fileId);
    } else {
      emitResult(response, "json");
    }
  },
});
