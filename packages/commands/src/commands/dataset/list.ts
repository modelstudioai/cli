import { defineCommand, listDatasets, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

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

    if (settings.dryRun) {
      emitResult(
        {
          action: "dataset.list",
          page: flags.page,
          page_size: flags.pageSize,
          purpose: flags.purpose,
        },
        "json",
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

    const items = files.map((item) => ({
      file_id: item.file_id ?? "",
      name: item.name ?? "",
      size: item.size !== undefined ? `${(item.size / 1024).toFixed(1)} KB` : "?",
      purpose: item.purpose ?? "",
    }));

    if (settings.quiet) {
      for (const item of items) emitBare(item.file_id);
    } else {
      emitResult({ items, total, request_id: response.request_id }, "json");
    }
  },
});
