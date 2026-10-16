import { defineCommand, listDeployments, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { validatePagination } from "./query-shared.ts";

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
  plan: {
    type: "string",
    valueHint: "<plan>",
    description: {
      "en-US": "Server-side plan filter; use ptu for throughput reservations",
      "zh-CN": "服务端方案筛选；吞吐预留使用 ptu",
    },
  },
  status: {
    type: "string",
    valueHint: "<status>",
    description: {
      "en-US": "Filter only the fetched page locally by ModelCode status; total remains unfiltered",
      "zh-CN": "仅在已获取的当前页本地筛选 ModelCode 状态；total 仍为筛选前总数",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "List model deployments and throughput reservations",
    "zh-CN": "列出模型部署及吞吐预留",
  },
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>] [--plan <plan>] [--status <status>]",
  flags: LIST_FLAGS,
  exampleArgs: [
    "",
    "--plan ptu",
    "--plan ptu --status RUNNING --page-size 100",
    "--page-size 20 --output json",
  ],
  notes: [
    {
      "en-US":
        "The deployment list API supports page_no/page_size/plan, not status. --status filters only the requested page, not the entire account; an empty filtered page does not mean there are no matches on later pages. total is the server total before local filtering; local_filter reports the current-page match count. PTU capacities are kTPM.",
      "zh-CN":
        "部署列表 API 支持 page_no/page_size/plan，不支持 status。--status 仅筛选所请求的当前页，不代表全账号筛选；当前页为空不代表后续页没有匹配项。total 是本地筛选前的服务端总数，local_filter 给出当前页匹配数量。PTU 容量单位为 kTPM。",
    },
  ],
  validate(flags) {
    return (
      validatePagination(flags) ??
      ([flags.plan, flags.status].some((value) => value !== undefined && !value.trim())
        ? "Filters must not be empty. / 筛选条件不能为空。"
        : undefined)
    );
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const page = flags.page ?? 1;
    const pageSize = flags.pageSize ?? 10;
    const status = flags.status?.trim();
    const plan = flags.plan?.trim();

    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.list",
          page,
          page_size: pageSize,
          plan,
          status,
          ...(status ? { filter_scope: "page" } : {}),
        },
        "json",
      );
      return;
    }

    const response = await listDeployments(ctx.client, { pageNo: page, pageSize, plan });
    const payload = response.output ?? response.data;
    const deployments = payload?.deployments ?? [];
    const filtered = status ? deployments.filter((item) => item.status === status) : deployments;
    const items = filtered.map((item) => ({
      ...item,
      deployed_model: item.deployed_model ?? "",
      model_name: item.model_name ?? "",
      status: item.status ?? "",
      plan: item.plan ?? "",
      capacity: item.capacity !== undefined ? String(item.capacity) : "",
      created_at: item.gmt_create ?? "",
    }));

    emitResult(
      {
        items,
        total: payload?.total,
        page_no: payload?.page_no ?? page,
        page_size: payload?.page_size ?? pageSize,
        ...(status
          ? {
              local_filter: {
                status,
                scope: "page",
                matched_count: items.length,
                unfiltered_page_count: deployments.length,
              },
            }
          : {}),
        request_id: response.request_id,
      },
      "json",
    );
  },
});
