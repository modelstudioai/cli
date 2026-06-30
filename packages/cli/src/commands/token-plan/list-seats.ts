import {
  defineCommand,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult, emitBare } from "../../output/output.ts";
import { padEnd } from "../../output/cjk-width.ts";
import type { GetSubscriptionSeatDetailsResponse, TokenPlanSeatDetail } from "./types.ts";
import {
  TOKEN_PLAN_AK_OPTIONS,
  TOKEN_PLAN_COMMON_QUERY_OPTIONS,
  appendCommonQueryParams,
  callTokenPlanApi,
  prepareTokenPlanRequest,
  resolveTokenPlanCredentials,
  type TokenPlanQueryParams,
} from "./utils.ts";

const API_ACTION = "GetSubscriptionSeatDetails";
const API_PATH = "/tokenplan/subscription/seat-detail";

export default defineCommand({
  name: "token-plan list-seats",
  description: "List Token Plan subscription seat details",
  usage: "bl token-plan list-seats [flags]",
  options: [
    { flag: "--page-no <n>", description: "Page number (default: 1)", type: "number" },
    { flag: "--page-size <n>", description: "Page size (default: 10)", type: "number" },
    ...TOKEN_PLAN_COMMON_QUERY_OPTIONS,
    {
      flag: "--status <status>",
      description:
        "Seat status filter (repeatable): CREATING, NORMAL, LIMIT, RELEASE, STOP, REFUNDED",
      type: "array",
    },
    {
      flag: "--status-list-str <json>",
      description: "StatusList as JSON string, e.g. '[\"NORMAL\"]'",
    },
    { flag: "--seat-id <id>", description: "Filter by seat ID" },
    {
      flag: "--seat-type <type>",
      description: "Seat tier: standard, pro, or max",
    },
    {
      flag: "--query-assigned <bool>",
      description: "Filter by assignment: true=assigned, false=unassigned",
    },
    ...TOKEN_PLAN_AK_OPTIONS,
  ],
  examples: [
    "bl token-plan list-seats",
    "bl token-plan list-seats --page-size 20 --status NORMAL",
    "bl token-plan list-seats --query-assigned true --seat-type standard",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const credentials = resolveTokenPlanCredentials(config, flags);
    const queryParams = buildQueryParams(flags);

    if (config.dryRun) {
      const { endpoint, queryParams: query } = prepareTokenPlanRequest(
        config,
        API_PATH,
        queryParams,
      );
      emitResult({ endpoint, query }, format);
      return;
    }

    const data = await callTokenPlanApi<GetSubscriptionSeatDetailsResponse>({
      config,
      credentials,
      action: API_ACTION,
      path: API_PATH,
      method: "GET",
      queryParams,
    });

    const items = data.Data?.Items ?? [];
    if (config.quiet || format === "text") {
      emitTextSeats(items, data.Data?.Total, data.Data?.PageNo, data.Data?.PageSize);
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(flags: GlobalFlags): TokenPlanQueryParams {
  const params: TokenPlanQueryParams = {};

  if (flags.pageNo !== undefined) params.PageNo = String(flags.pageNo as number);
  if (flags.pageSize !== undefined) params.PageSize = String(flags.pageSize as number);
  appendCommonQueryParams(params, flags);
  if (flags.statusListStr) params.StatusListStr = flags.statusListStr as string;

  const status = flags.status as string[] | undefined;
  if (status && status.length > 0) {
    params.StatusList = status;
  }

  if (flags.seatId) params.SeatId = flags.seatId as string;
  if (flags.seatType) params.SeatType = flags.seatType as string;

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
