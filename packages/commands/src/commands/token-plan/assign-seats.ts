import {
  defineCommand,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { BatchAssignSeatsResponse } from "./types.ts";
import {
  TOKEN_PLAN_COMMON_QUERY_FLAGS,
  TOKEN_PLAN_WORKSPACE_FLAG,
  appendCommonQueryParams,
  callTokenPlanApi,
  prepareTokenPlanRequest,
  requireWorkspaceId,
  type TokenPlanQueryParams,
} from "./utils.ts";

const API_ACTION = "BatchAssignSeats";
const API_PATH = "/tokenplan/subscription/seat-assignments";

const ASSIGN_SEATS_FLAGS = {
  ...TOKEN_PLAN_WORKSPACE_FLAG,
  seatType: {
    type: "string",
    valueHint: "<type>",
    description: "Seat tier: standard, pro, or max",
    required: true,
  },
  accountId: {
    type: "array",
    valueHint: "<id>",
    description: "Target member account ID (repeatable)",
  },
  ...TOKEN_PLAN_COMMON_QUERY_FLAGS,
  locale: { type: "string", valueHint: "<locale>", description: "Language: zh-CN or en-US" },
} satisfies FlagsDef;
type AssignSeatsFlags = ParsedFlags<typeof ASSIGN_SEATS_FLAGS>;

export default defineCommand({
  description: "Batch assign Token Plan seats to members",
  auth: "openapi",
  usageArgs: "--workspace-id <id> --seat-type <type> --account-id <id> [flags]",
  flags: ASSIGN_SEATS_FLAGS,
  exampleArgs: [
    "--workspace-id ws_456 --seat-type standard --account-id acc_123",
    "--workspace-id ws_456 --seat-type pro --account-id acc_1 --account-id acc_2",
  ],
  validate: (f) =>
    f.accountId && f.accountId.length > 0 ? undefined : "Missing required flag: --account-id",
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const workspaceId = requireWorkspaceId(settings, flags, identity.binName);
    const queryParams = buildQueryParams(flags, workspaceId);

    if (settings.dryRun) {
      const { endpoint, queryParams: query } = prepareTokenPlanRequest(
        ctx.client.baseUrl,
        API_PATH,
        queryParams,
      );
      emitResult({ endpoint, query }, format);
      return;
    }

    const data = await callTokenPlanApi<BatchAssignSeatsResponse>({
      client: ctx.client,
      baseUrl: ctx.client.baseUrl,
      action: API_ACTION,
      path: API_PATH,
      method: "POST",
      queryParams,
    });

    if (settings.quiet || format === "text") {
      emitBare("Seats assigned successfully.");
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(flags: AssignSeatsFlags, workspaceId: string): TokenPlanQueryParams {
  const params: TokenPlanQueryParams = {};

  params.WorkspaceId = workspaceId;
  if (flags.seatType) params.SeatType = flags.seatType;
  appendCommonQueryParams(params, flags);
  if (flags.locale) params.Locale = flags.locale;

  if (flags.accountId && flags.accountId.length > 0) {
    params.AccountIds = flags.accountId;
  }

  return params;
}
