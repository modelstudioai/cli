import {
  CONSOLE_DATASET_GROUPS_API,
  buildConsoleDatasetGroupsRequest,
  listConsoleDatasetGroups,
} from "bailian-cli-core";
import { defineConsoleReadCommand, consoleReadTargetPreview } from "../shared/console-read.ts";

export default defineConsoleReadCommand({
  auth: "console",
  description: {
    "en-US": "List Console dataset groups",
    "zh-CN": "查询 Console 数据集组列表",
  },
  usageArgs: "[--page <n>] [--page-size <n>] [--name <name>]",
  flags: {
    page: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Page number, a positive safe integer (default: 1)",
        "zh-CN": "页码，正安全整数（默认：1）",
      },
    },
    pageSize: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Groups per page, a positive safe integer (default: 10)",
        "zh-CN": "每页组数，正安全整数（默认：10）",
      },
    },
    name: {
      type: "string",
      valueHint: "<name>",
      description: {
        "en-US": "Nonblank dataset group name for server-side filtering; trimmed before sending",
        "zh-CN": "用于服务端筛选的非空白数据集组名称，去除首尾空白后传递",
      },
    },
  },
  exampleArgs: ["", "--page 2 --page-size 20", "--name example-dataset --dry-run"],
  notes: [
    {
      "en-US":
        "Fetches only the requested page. records contains dataset groups; items is the server's total count for the query. All business-response fields are preserved. The API Key / file_id semantics of dataset list are unchanged.",
      "zh-CN":
        "仅获取请求的当前页。records 为数据集组列表，items 为服务端返回的查询总数。保留所有业务响应字段，不改变 dataset list 的 API Key / file_id 语义。",
    },
    {
      "en-US":
        "Each group's datasets is only a one-version preview, not its complete version list. Pass datasetGroupId to dataset version --dataset-group-id for {result:[...]} (no completeness guarantee or pagination); use dataset version --dataset-id with a version's datasetId for details (--include-status is detail-only). Exactly one ID flag is required; they cannot be combined. fileId is not datasetId.",
      "zh-CN":
        "各组的 datasets 仅是一条版本预览，不是完整版本列表。将 datasetGroupId 传给 dataset version --dataset-group-id，返回 {result:[...]}（不保证全量，无分页）；查询详情用 dataset version --dataset-id，传入版本的 datasetId，仅此模式可加 --include-status。两个 ID 参数必选一个且不能同传。fileId 不是 datasetId。",
    },
    {
      "en-US":
        "--name is trimmed and sent to the server without local filtering. No type filter is hardcoded, but server-side scope and defaults still affect results; this is not an account-wide exhaustive listing. There is no --all option.",
      "zh-CN":
        "--name 去除首尾空白后交由服务端筛选，不做本地筛选。不硬编码类型过滤，但服务端作用域与默认条件仍影响结果，不代表整个账号的全量列表。不提供 --all 选项。",
    },
    {
      "en-US":
        "The preview requests one import task per version, without guaranteeing the latest task or all tasks. Status codes are preserved as returned; no release, validation, or training readiness is inferred.",
      "zh-CN":
        "预览为每个版本请求一条导入任务，不保证是最新任务或涵盖全部任务。保留返回的状态原码，不据此判断发布、校验或训练就绪。",
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
    if (flags.name !== undefined && !flags.name.trim()) {
      return {
        "en-US": "--name must not be blank when provided.",
        "zh-CN": "传入的 --name 不能仅包含空白或为空。",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const params = {
      page: ctx.flags.page ?? 1,
      pageSize: ctx.flags.pageSize ?? 10,
      name: ctx.flags.name?.trim(),
    };
    if (ctx.settings.dryRun) {
      const preview = {
        action: "dataset.groups",
        api: CONSOLE_DATASET_GROUPS_API,
        data: buildConsoleDatasetGroupsRequest(params),
        ...consoleReadTargetPreview(ctx.settings),
      };
      ctx.output.result(preview, { text: JSON.stringify(preview, null, 2) });
      return;
    }
    const response = await listConsoleDatasetGroups(ctx.client, params);
    ctx.output.result(response, { text: JSON.stringify(response, null, 2) });
  },
});
