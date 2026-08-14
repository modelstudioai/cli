import { defineCommand, detectOutputFormat, deleteDataset, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, emitRequestId } from "bailian-cli-runtime";

const DELETE_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Dataset file ID (required)", "zh-CN": "数据集文件 ID（必填）" },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Delete a dataset file by ID", "zh-CN": "通过 ID 删除数据集文件" },
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
      emitRequestId(response.request_id, settings.quiet);
    } else {
      emitResult(response, format);
    }
  },
});
