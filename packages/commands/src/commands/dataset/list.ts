import { defineCommand, listDatasets, type FlagsDef } from "bailian-cli-core";

const LIST_FLAGS = {
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Results per page (default: 10, max 100)",
      "zh-CN": "每页结果数（默认：10，最多：100）",
    },
  },
  purpose: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": 'Filter by purpose (e.g. "fine-tune", "evaluation"). Omit to list all.',
      "zh-CN": '按用途筛选（例如 "fine-tune"、"evaluation"）。省略时列出全部。',
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "List uploaded dataset files", "zh-CN": "列出已上传的数据集文件" },
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>] [--purpose <name>]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--purpose fine-tune", "--purpose evaluation --page-size 20", "--output json"],
  async run(ctx) {
    const { settings, flags } = ctx;

    if (settings.dryRun) {
      const resultData1 = {
        action: "dataset.list",
        page: flags.page,
        page_size: flags.pageSize,
        purpose: flags.purpose,
      };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
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

    {
      const resultData2 = { items, total, request_id: response.request_id };
      ctx.output.result(
        resultData2,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData2, null, 2) } : undefined,
      );
    }
  },
});
