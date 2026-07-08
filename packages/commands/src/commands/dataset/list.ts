import { defineCommand, detectOutputFormat, listDatasets, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare, formatTable } from "bailian-cli-runtime";

const LIST_FLAGS = {
  page: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: "Results per page (default: 10, max 100)",
  },
  purpose: {
    type: "string",
    valueHint: "<name>",
    description: 'Filter by purpose (e.g. "fine-tune", "evaluation"). Omit to list all.',
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "List uploaded dataset files",
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>] [--purpose <name>]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--purpose fine-tune", "--purpose evaluation --page-size 20", "--output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          action: "dataset.list",
          page: flags.page,
          page_size: flags.pageSize,
          purpose: flags.purpose,
        },
        format,
      );
      return;
    }

    const response = await listDatasets(ctx.client, {
      pageNo: flags.page,
      pageSize: flags.pageSize,
      purpose: flags.purpose || undefined,
    });
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
