import { defineCommand, deleteDataset, type FlagsDef } from "bailian-cli-core";

const DELETE_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Dataset file ID (required)", "zh-CN": "数据集文件 ID（必填）" },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "Delete a dataset file by ID", "zh-CN": "通过 ID 删除数据集文件" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently deletes the specified dataset file and cannot be undone.",
      "zh-CN": "该操作会永久删除指定的数据集文件，且无法撤销。",
    },
  },
  usageArgs: "--file-id <id>",
  flags: DELETE_FLAGS,
  exampleArgs: [
    "--file-id file-id-xxx",
    "--file-id file-id-xxx --dry-run",
    "--file-id file-id-xxx --yes",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const fileId = flags.fileId;

    if (settings.dryRun) {
      const resultData1 = { action: "dataset.delete", file_id: fileId };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }

    const response = await deleteDataset(ctx.client, fileId);

    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
