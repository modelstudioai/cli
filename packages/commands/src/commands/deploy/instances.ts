import {
  CONSOLE_DEPLOY_INSTANCES_API,
  buildConsoleDeploymentInstancesRequest,
  listConsoleDeploymentInstances,
  type FlagsDef,
} from "bailian-cli-core";
import { defineConsoleReadCommand, consoleReadTargetPreview } from "../shared/console-read.ts";

const FLAGS = {
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Results per page (default: 10)", "zh-CN": "每页条数（默认：10）" },
  },
  keyword: {
    type: "string",
    valueHint: "<keyword>",
    description: { "en-US": "Server-side name keyword filter", "zh-CN": "服务端名称关键词筛选" },
  },
  modelServiceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Server-side model service ID filter",
      "zh-CN": "服务端模型服务 ID 筛选",
    },
  },
} satisfies FlagsDef;

export default defineConsoleReadCommand({
  auth: "console",
  defaultOutput: "json",
  description: {
    "en-US": "List Console independent deployment services",
    "zh-CN": "查询 Console 独立部署服务列表",
  },
  flags: FLAGS,
  usageArgs: "[--page <n>] [--page-size <n>] [--keyword <keyword>] [--model-service-id <id>]",
  exampleArgs: [
    "",
    "--page 2 --page-size 20",
    "--keyword example --model-service-id example-service-id",
  ],
  notes: [
    {
      "en-US":
        "Lists Console independent deployment services, not capacity instances or replicas. Fetches only the requested page; records is the list and items is the server's total count. Preserves all business-response fields without deriving callable status.",
      "zh-CN":
        "查询 Console 独立部署服务，非容量实例或副本。仅获取请求的当前页；records 为列表，items 为服务端总数。保留所有业务响应字段，不推导 callable 状态。",
    },
    {
      "en-US":
        "--keyword and --model-service-id may be supplied together and are forwarded to the API without local filtering. Successful reading does not prove inference or pause permission. This command does not change the API-key deployment list contract.",
      "zh-CN":
        "--keyword 与 --model-service-id 可同时传入，原样交由 API 筛选，不做本地筛选。读取成功不证明具有推理或暂停权限。本命令不改变 API Key 部署列表的契约。",
    },
  ],
  validate(flags) {
    if (flags.page !== undefined && (!Number.isSafeInteger(flags.page) || flags.page < 1)) {
      return {
        "en-US": "--page must be a positive safe integer.",
        "zh-CN": "--page 必须为正安全整数。",
      };
    }
    if (
      flags.pageSize !== undefined &&
      (!Number.isSafeInteger(flags.pageSize) || flags.pageSize < 1)
    ) {
      return {
        "en-US": "--page-size must be a positive safe integer.",
        "zh-CN": "--page-size 必须为正安全整数。",
      };
    }
    if (
      [flags.keyword, flags.modelServiceId].some((value) => value !== undefined && !value.trim())
    ) {
      return {
        "en-US": "--keyword and --model-service-id must not be blank when provided.",
        "zh-CN": "传入的 --keyword 和 --model-service-id 不能仅包含空白或为空。",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const { flags, settings } = ctx;
    const params = {
      page: flags.page,
      pageSize: flags.pageSize,
      keyword: flags.keyword,
      modelServiceId: flags.modelServiceId,
    };
    if (settings.dryRun) {
      const preview = {
        action: "deploy.instances",
        api: CONSOLE_DEPLOY_INSTANCES_API,
        data: buildConsoleDeploymentInstancesRequest(params),
        ...consoleReadTargetPreview(settings),
      };
      ctx.output.result(
        preview,
        settings.output === "text" ? { text: JSON.stringify(preview, null, 2) } : undefined,
      );
      return;
    }
    const response = await listConsoleDeploymentInstances(ctx.client, params);
    ctx.output.result(
      response,
      settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
