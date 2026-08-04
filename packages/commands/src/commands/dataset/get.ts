import { defineCommand, detectOutputFormat, getDataset, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, emitRequestId } from "bailian-cli-runtime";

const GET_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: "Dataset file ID (required)",
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Get details of a single dataset file",
  auth: "apiKey",
  usageArgs: "--file-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--file-id file-xxx", "--file-id file-xxx --output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const fileId = flags.fileId;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ action: "dataset.get", file_id: fileId }, format);
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

    if (format === "json") {
      emitResult({ ...item, request_id: response.request_id }, format);
      return;
    }

    // text / quiet
    emitBare(`file_id:      ${item.file_id}`);
    emitBare(`name:         ${item.name}`);
    emitBare(`size:         ${item.size}`);
    if (item.md5) emitBare(`md5:          ${item.md5}`);
    if (item.purpose) emitBare(`purpose:      ${item.purpose}`);
    if (item.created_at) emitBare(`created_at:   ${item.created_at}`);
    if (item.description) emitBare(`description:  ${item.description}`);
    emitRequestId(response.request_id, settings.quiet);
  },
});
