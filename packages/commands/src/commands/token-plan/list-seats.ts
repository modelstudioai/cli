import {
  defineCommand,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult, emitBare, padEnd } from "bailian-cli-runtime";
import type { GetSubscriptionSeatDetailsResponse, TokenPlanSeatDetail } from "./types.ts";
import {
  TOKEN_PLAN_COMMON_QUERY_FLAGS,
  appendCommonQueryParams,
  callTokenPlanApi,
  prepareTokenPlanRequest,
  type TokenPlanQueryParams,
} from "./utils.ts";

const API_ACTION = "GetSubscriptionSeatDetails";
const API_PATH = "/tokenplan/subscription/seat-detail";

const LIST_SEATS_FLAGS = {
  pageNo: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page size (default: 10)", "zh-CN": "每页数量（默认：10）" },
  },
  ...TOKEN_PLAN_COMMON_QUERY_FLAGS,
  status: {
    type: "array",
    valueHint: "<status>",
    description: {
      "en-US": "Seat status filter (repeatable): CREATING, NORMAL, LIMIT, RELEASE, STOP, REFUNDED",
      "zh-CN": "席位状态筛选（可重复）：CREATING、NORMAL、LIMIT、RELEASE、STOP、REFUNDED",
    },
  },
  statusListStr: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": "StatusList as JSON string, e.g. '[\"NORMAL\"]'",
      "zh-CN": "JSON 字符串格式的 StatusList，例如 '[\"NORMAL\"]'",
    },
  },
  seatId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Filter by seat ID", "zh-CN": "按席位 ID 筛选" },
  },
  seatType: {
    type: "string",
    valueHint: "<type>",
    description: {
      "en-US": "Seat tier: standard, pro, or max",
      "zh-CN": "席位档位：standard、pro 或 max",
    },
  },
  queryAssigned: {
    type: "string",
    valueHint: "<bool>",
    description: {
      "en-US": "Filter by assignment: true=assigned, false=unassigned",
      "zh-CN": "按分配状态筛选：true=已分配，false=未分配",
    },
  },
} satisfies FlagsDef;
type ListSeatsFlags = ParsedFlags<typeof LIST_SEATS_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "List Token Plan subscription seat details",
    "zh-CN": "列出 Token Plan 订阅席位详情",
  },
  auth: "openapi",
  usageArgs: "[flags]",
  flags: LIST_SEATS_FLAGS,
  exampleArgs: ["", "--page-size 20 --status NORMAL", "--query-assigned true --seat-type standard"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const queryParams = buildQueryParams(flags);

    if (settings.dryRun) {
      const { endpoint, queryParams: query } = prepareTokenPlanRequest(
        ctx.client.baseUrl,
        API_PATH,
        queryParams,
      );
      emitResult({ endpoint, query }, format);
      return;
    }

    const data = await callTokenPlanApi<GetSubscriptionSeatDetailsResponse>({
      client: ctx.client,
      baseUrl: ctx.client.baseUrl,
      action: API_ACTION,
      path: API_PATH,
      method: "GET",
      queryParams,
    });

    const items = data.Data?.Items ?? [];
    if (settings.quiet || format === "text") {
      emitTextSeats(items, data.Data?.Total, data.Data?.PageNo, data.Data?.PageSize);
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(flags: ListSeatsFlags): TokenPlanQueryParams {
  const params: TokenPlanQueryParams = {};

  if (flags.pageNo !== undefined) params.PageNo = String(flags.pageNo);
  if (flags.pageSize !== undefined) params.PageSize = String(flags.pageSize);
  appendCommonQueryParams(params, flags);
  if (flags.statusListStr) params.StatusListStr = flags.statusListStr;

  if (flags.status && flags.status.length > 0) {
    params.StatusList = flags.status;
  }

  if (flags.seatId) params.SeatId = flags.seatId;
  if (flags.seatType) params.SeatType = flags.seatType;

  if (typeof flags.queryAssigned === "string" && flags.queryAssigned.length > 0) {
    const val = flags.queryAssigned.toLowerCase();
    if (val !== "true" && val !== "false") {
      throw new BailianError("--query-assigned must be 'true' or 'false'.", ExitCode.USAGE);
    }
    params.QueryAssigned = val;
  }

  return params;
}

function emitTextSeats(
  items: TokenPlanSeatDetail[],
  total?: number,
  pageNo?: number,
  pageSize?: number,
): void {
  if (items.length === 0) {
    emitBare("No seats found.");
    return;
  }

  const header = [
    padEnd("SeatId", 18),
    padEnd("Type", 10),
    padEnd("Status", 10),
    padEnd("Assigned", 12),
    padEnd("Account", 20),
  ].join(" ");
  emitBare(header);
  emitBare("-".repeat(header.length));

  for (const item of items) {
    const row = [
      padEnd(item.SeatId ?? "-", 18),
      padEnd(item.SpecType ?? "-", 10),
      padEnd(item.Status ?? "-", 10),
      padEnd(item.AssignedStatus ?? "-", 12),
      padEnd(item.AccountName ?? item.AccountId ?? "-", 20),
    ].join(" ");
    emitBare(row);
  }

  if (total !== undefined) {
    emitBare("");
    emitBare(
      `Total: ${total}${pageNo !== undefined ? ` | Page: ${pageNo}` : ""}${pageSize !== undefined ? ` | PageSize: ${pageSize}` : ""}`,
    );
  }
}
