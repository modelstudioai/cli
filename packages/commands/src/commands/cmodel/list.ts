import {
  defineCommand,
  listCustomModelImports,
  type CustomModelImportJob,
  type FlagsDef,
} from "bailian-cli-core";

import { PUBLIC_DASHSCOPE_NOTE } from "./shared.ts";

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
  status: {
    type: "string",
    valueHint: "<status>",
    choices: ["PENDING", "RUNNING", "SUCCESSED", "FAILED"] as const,
    description: {
      "en-US": "Filter by status (server-side)",
      "zh-CN": "按任务状态筛选（服务端筛选）",
    },
  },
  modelName: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Filter by the server-generated model identifier (exact match, server-side)",
      "zh-CN": "按服务端生成的模型标识精确筛选（服务端筛选）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "List custom models (import jobs)",
    "zh-CN": "列出自定义模型（导入任务）",
  },
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>] [--status <status>] [--model-name <name>]",
  flags: LIST_FLAGS,
  exampleArgs: [
    "",
    "--status RUNNING",
    "--model-name qwen3-32b-offline-20240101-abc1",
    "--page-size 20",
  ],
  notes: [
    PUBLIC_DASHSCOPE_NOTE,
    {
      "en-US":
        "status and model-name are server-side filters over the whole result set (not local page filters). FAILED entries include the server-provided error_code.",
      "zh-CN":
        "status 与 model-name 由服务端在整个结果集上筛选（不是本页本地筛选）。FAILED 条目会包含服务端提供的 error_code。",
    },
  ],
  validate(flags) {
    if (flags.page !== undefined && (!Number.isFinite(flags.page) || flags.page < 1)) {
      return "--page must be at least 1. / --page 必须至少为 1。";
    }
    if (
      flags.pageSize !== undefined &&
      (!Number.isFinite(flags.pageSize) || flags.pageSize < 1 || flags.pageSize > 100)
    ) {
      return "--page-size must be between 1 and 100. / --page-size 必须在 1 到 100 之间。";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const params = {
      pageNo: flags.page,
      pageSize: flags.pageSize,
      status: flags.status || undefined,
      modelName: flags.modelName || undefined,
    };

    if (settings.dryRun) {
      const resultData = { action: "cmodel.list", ...params };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    const response = await listCustomModelImports(ctx.client, params);
    const payload = response.output ?? response.data;
    const jobs: CustomModelImportJob[] = payload?.list ?? [];
    const items = jobs.map((job) => ({
      job_id: job.job_id ?? "",
      model_name: job.model_name ?? "",
      display_name: job.display_name ?? "",
      source: job.source ?? "",
      storage_info: job.storage_info ?? null,
      status: job.status ?? "",
      gmt_create: job.gmt_create ?? "",
      ...(job.error_code !== undefined ? { error_code: job.error_code } : {}),
    }));
    const resultData = {
      items,
      total: payload?.total ?? items.length,
      page_no: payload?.page_no ?? params.pageNo ?? 1,
      page_size: payload?.page_size ?? params.pageSize ?? 10,
      request_id: response.request_id,
    };
    ctx.output.result(
      resultData,
      ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
    );
  },
});
