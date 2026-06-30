import {
  defineCommand,
  detectOutputFormat,
  getDataset,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "dataset get",
  description: "Get details of a single dataset file",
  usage: "bl dataset get --file-id <id>",
  options: [{ flag: "--file-id <id>", description: "Dataset file ID (required)", required: true }],
  examples: [
    "bl dataset get --file-id file-xxx",
    "bl dataset get --file-id file-xxx --output json",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const fileId = flags.fileId as string | undefined;
    if (!fileId) failIfMissing("file-id", "bl dataset get --file-id <id>");

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ action: "dataset.get", file_id: fileId }, format);
      return;
    }

    const response = await getDataset(config, fileId!);
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
      emitResult(item, format);
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
  },
});
