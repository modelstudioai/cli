import { defineCommand } from "bailian-cli-core";
import {
  APP_CONTROL_LIST_API,
  APP_TYPE_AGENT,
  APP_TYPE_CCAI,
  APP_TYPE_FLAG,
  APP_TYPE_HIGH_CODE,
  resolveAppType,
} from "./shared.ts";

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
    ...APP_TYPE_FLAG,
  },
  exampleArgs: [
    "",
    {
      "en-US": "--name customer service",
      "zh-CN": "--name 客户服务",
    },
    "--page 2 --page-size 10",
    "--type workflow",
    "--output json",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const name = flags.name || "";
    const pageNo = flags.page || 1;
    const pageSize = flags.pageSize || 30;
    const appType = resolveAppType(flags);

    const reqDTO: Record<string, unknown> = {
      name,
      statuses: [1, 4],
      page_no: pageNo,
      page_size: pageSize,
    };
    if (appType === "workflow") {
      // Workflow page uses exclusion: not agent, not high-code, not CCAI.
      reqDTO.notInTypes = [APP_TYPE_AGENT, APP_TYPE_HIGH_CODE, APP_TYPE_CCAI];
    } else {
      reqDTO.type = APP_TYPE_AGENT;
      reqDTO.notInTypes = [APP_TYPE_CCAI];
    }
    const data = { reqDTO };

    if (settings.dryRun) {
      ctx.output.result({ api: APP_CONTROL_LIST_API, data });
      return;
    }

    const result = await ctx.client.console<any>(APP_CONTROL_LIST_API, data);

    const list: unknown[] = result?.data?.DataV2?.data?.data?.list ?? [];
    const total: number = result?.data?.DataV2?.data?.data?.total ?? 0;

    const apps = list.map((item: any) => ({
      code: item.code,
      name: item.name,
      user_prompt_params: item.config?.user_prompt_params ?? [],
    }));

    ctx.output.result({ total, apps });
  },
});
