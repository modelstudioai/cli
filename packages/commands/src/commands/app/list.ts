import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const APP_LIST_API = "zeldaEasy.broadscope-bailian.app-control.list";

export default defineCommand({
  description: { "en-US": "List Bailian applications", "zh-CN": "列出百炼应用" },
  auth: "console",
  usageArgs: "[flags]",
  flags: {
    name: {
      type: "string",
      valueHint: "<name>",
      description: {
        "en-US": "Filter by app name (keyword search)",
        "zh-CN": "按应用名称筛选（关键词搜索）",
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
      description: { "en-US": "Results per page (default: 30)", "zh-CN": "每页结果数（默认：30）" },
    },
  },
  exampleArgs: ["", "--name customer service", "--page 2 --page-size 10", "--output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const name = flags.name || "";
    const pageNo = flags.page || 1;
    const pageSize = flags.pageSize || 30;
    const format = detectOutputFormat(settings.output);

    const data = {
      reqDTO: {
        name,
        notInTypes: [10],
        type: 5,
        statuses: [1, 4],
        page_no: pageNo,
        page_size: pageSize,
      },
    };

    if (settings.dryRun) {
      emitResult({ api: APP_LIST_API, data }, format);
      return;
    }

    const result = await ctx.client.console<any>(APP_LIST_API, data);

    const list: unknown[] = result?.data?.DataV2?.data?.data?.list ?? [];
    const total: number = result?.data?.DataV2?.data?.data?.total ?? 0;

    const apps = list.map((item: any) => ({
      code: item.code,
      name: item.name,
      user_prompt_params: item.config?.user_prompt_params ?? [],
    }));

    emitResult({ total, apps }, format);
  },
});
