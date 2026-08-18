import { defineCommand, getDataset, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const GET_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Dataset file ID (required)", "zh-CN": "数据集文件 ID（必填）" },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Get details of a single dataset file",
    "zh-CN": "获取单个数据集文件的详情",
  },
  auth: "apiKey",
  usageArgs: "--file-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--file-id file-xxx", "--file-id file-xxx --output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const fileId = flags.fileId;

    if (settings.dryRun) {
      emitResult({ action: "dataset.get", file_id: fileId }, "json");
      return;
    }

    const response = await getDataset(ctx.client, fileId);
    const file = response.data;

    if (!file) {
      emitBare(`No data returned for ${fileId}`);
      return;
    }

    const sizeKb = file.size !== undefined ? `${(file.size / 1024).toFixed(1)} KB` : "?";
    const item = {
      file_id: file.file_id ?? fileId,
      name: file.name ?? "",
      size: sizeKb,
      md5: file.md5 ?? "",
      purpose: file.purpose ?? "",
      created_at: file.gmt_create ?? "",
      description: file.description ?? "",
    };

    if (settings.quiet) {
      emitBare(item.file_id);
    } else {
      emitResult({ ...item, request_id: response.request_id }, "json");
    }
  },
});
