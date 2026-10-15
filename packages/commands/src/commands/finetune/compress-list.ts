import { defineCommand, listCompressJobs, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const LIST_FLAGS = {
  status: {
    type: "string",
    valueHint: "<status>",
    description: { "en-US": "Filter by job status", "zh-CN": "按任务状态筛选" },
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description: { "en-US": "Filter by source model ID", "zh-CN": "按源模型 ID 筛选" },
  },
  templateId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Filter by template ID", "zh-CN": "按模板 ID 筛选" },
  },
  quantSpec: {
    type: "string",
    valueHint: "<spec>",
    description: { "en-US": "Filter by quantization specification", "zh-CN": "按量化规格筛选" },
  },
  quantMethod: {
    type: "string",
    valueHint: "<method>",
    description: { "en-US": "Filter by quantization method", "zh-CN": "按量化算法筛选" },
  },
  startTime: {
    type: "string",
    valueHint: "<time>",
    description: {
      "en-US": "Filter jobs starting no earlier than this time",
      "zh-CN": "筛选开始时间不早于该时间的任务",
    },
  },
  endTime: {
    type: "string",
    valueHint: "<time>",
    description: {
      "en-US": "Filter jobs ending no later than this time",
      "zh-CN": "筛选结束时间不晚于该时间的任务",
    },
  },
  search: {
    type: "string",
    valueHint: "<keyword>",
    description: { "en-US": "Search job ID or name", "zh-CN": "搜索任务 ID 或名称" },
  },
  searchField: {
    type: "string",
    valueHint: "<field>",
    choices: ["job_id", "job_name"] as const,
    description: {
      "en-US": "Limit --search to job_id or job_name",
      "zh-CN": "将 --search 限制为 job_id 或 job_name",
    },
  },
  sortOrder: {
    type: "string",
    valueHint: "<order>",
    choices: ["asc", "desc"] as const,
    description: {
      "en-US": "Sort order by create_time (default: desc)",
      "zh-CN": "按 create_time 排序（默认：desc）",
    },
  },
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Results per page (default: 10, max: 100)",
      "zh-CN": "每页数量（默认：10，最多：100）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "List model compression jobs", "zh-CN": "列出模型压缩任务" },
  auth: "apiKey",
  usageArgs: "[filters] [--page <n>] [--page-size <n>]",
  flags: LIST_FLAGS,
  validate(flags) {
    if (flags.page !== undefined && (!Number.isInteger(flags.page) || flags.page < 1))
      return "--page must be an integer of at least 1. / --page 必须是大于等于 1 的整数。";
    if (
      flags.pageSize !== undefined &&
      (!Number.isInteger(flags.pageSize) || flags.pageSize < 1 || flags.pageSize > 100)
    )
      return "--page-size must be an integer between 1 and 100. / --page-size 必须是 1–100 的整数。";
    if (flags.searchField && !flags.search)
      return "--search-field requires --search. / --search-field 必须与 --search 一起使用。";
    return undefined;
  },
  exampleArgs: [
    "",
    "--status SUCCEEDED --page-size 20",
    "--quant-method gptq",
    "--search qwen3 --search-field job_name --sort-order asc",
  ],
  async run(ctx) {
    const params = {
      status: ctx.flags.status,
      model: ctx.flags.model,
      templateId: ctx.flags.templateId,
      quantSpec: ctx.flags.quantSpec,
      quantMethod: ctx.flags.quantMethod,
      startTime: ctx.flags.startTime,
      endTime: ctx.flags.endTime,
      searchKey: ctx.flags.search,
      selectKey: ctx.flags.searchField,
      sortOrder: ctx.flags.sortOrder,
      pageNo: ctx.flags.page,
      pageSize: ctx.flags.pageSize,
    };
    if (ctx.settings.dryRun) {
      emitResult({ action: "finetune.compress.list", ...params }, "json");
      return;
    }
    const response = await listCompressJobs(ctx.client, params);
    const output = response.output;
    const items = (output?.jobs ?? []).map((job) => ({
      job_id: job.job_id ?? "",
      job_name: job.job_name ?? "",
      status: job.status ?? "",
      model: job.model ?? "",
      template_name: job.template_name ?? "",
      quantized_output: job.quantized_output ?? "",
      create_time: job.create_time ?? "",
    }));
    emitResult(
      {
        items,
        total: output?.total,
        page_no: output?.page_no,
        page_size: output?.page_size,
        request_id: response.request_id,
      },
      "json",
    );
  },
});
