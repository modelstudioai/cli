import {
  defineCommand,
  detectOutputFormat,
  listDatasets,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult, emitBare } from "../../output/output.ts";
import { formatTable } from "../../output/table.ts";

export default defineCommand({
  name: "dataset list",
  description: "List uploaded dataset files",
  usage: "bl dataset list [--page <n>] [--page-size <n>] [--purpose <name>]",
  options: [
    { flag: "--page <n>", description: "Page number (default: 1)", type: "number" },
    {
      flag: "--page-size <n>",
      description: "Results per page (default: 10, max 100)",
      type: "number",
    },
    {
      flag: "--purpose <name>",
      description: 'Filter by purpose (e.g. "fine-tune", "evaluation"). Omit to list all.',
    },
  ],
  examples: [
    "bl dataset list",
    "bl dataset list --purpose fine-tune",
    "bl dataset list --purpose evaluation --page-size 20",
    "bl dataset list --output json",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const pageNo = flags.page !== undefined ? (flags.page as number) : undefined;
    const pageSize = flags.pageSize !== undefined ? (flags.pageSize as number) : undefined;
    const purpose = (flags.purpose as string | undefined) || undefined;

    if (config.dryRun) {
      emitResult({ action: "dataset.list", page: pageNo, page_size: pageSize, purpose }, format);
      return;
    }

    const response = await listDatasets(config, { pageNo, pageSize, purpose });
    const files = response.data?.files ?? [];
    const total = response.data?.total;

    // Normalize to consistent structure for both text/json output.
    const items = files.map((item) => ({
      file_id: item.file_id ?? "",
      name: item.name ?? "",
      size: item.size !== undefined ? `${(item.size / 1024).toFixed(1)} KB` : "?",
      purpose: item.purpose ?? "",
    }));

    if (format === "json") {
      emitResult({ items, total }, format);
      return;
    }

    // text / quiet
    if (items.length === 0) {
      emitBare("No dataset files found.");
      return;
    }
    const headers = ["FILE_ID", "NAME", "SIZE", "PURPOSE"];
    const rows = items.map((i) => [i.file_id, i.name, i.size, i.purpose]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    if (total !== undefined) emitBare(`\nTotal: ${total}`);
  },
});
