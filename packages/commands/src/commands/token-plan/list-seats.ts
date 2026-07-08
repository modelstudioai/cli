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
  TOKEN_PLAN_AK_FLAGS,
  TOKEN_PLAN_COMMON_QUERY_FLAGS,
  appendCommonQueryParams,
  callTokenPlanApi,
  prepareTokenPlanRequest,
  resolveTokenPlanCredentials,
  type TokenPlanQueryParams,
} from "./utils.ts";

const API_ACTION = "GetSubscriptionSeatDetails";
const API_PATH = "/tokenplan/subscription/seat-detail";

const LIST_SEATS_FLAGS = {
  pageNo: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
  pageSize: { type: "number", valueHint: "<n>", description: "Page size (default: 10)" },
  ...TOKEN_PLAN_COMMON_QUERY_FLAGS,
  status: {
    type: "array",
    valueHint: "<status>",
    description:
      "Seat status filter (repeatable): CREATING, NORMAL, LIMIT, RELEASE, STOP, REFUNDED",
  },
  statusListStr: {
    type: "string",
    valueHint: "<json>",
    description: "StatusList as JSON string, e.g. '[\"NORMAL\"]'",
  },
  seatId: { type: "string", valueHint: "<id>", description: "Filter by seat ID" },
  seatType: {
    type: "string",
    valueHint: "<type>",
    description: "Seat tier: standard, pro, or max",
  },
  queryAssigned: {
    type: "string",
    valueHint: "<bool>",
    description: "Filter by assignment: true=assigned, false=unassigned",
  },
  ...TOKEN_PLAN_AK_FLAGS,
} satisfies FlagsDef;
type ListSeatsFlags = ParsedFlags<typeof LIST_SEATS_FLAGS>;

export default defineCommand({
  description: "List Token Plan subscription seat details",
  // AK/SK 私有解析(见 utils.ts),不走集中凭证域。
  auth: "none",
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

    const credentials = resolveTokenPlanCredentials(flags);
    const data = await callTokenPlanApi<GetSubscriptionSeatDetailsResponse>({
      settings,
      baseUrl: ctx.client.baseUrl,
      credentials,
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
