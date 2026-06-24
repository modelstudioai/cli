import {
  defineCommand,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult, emitBare } from "../../output/output.ts";
import type { BatchAssignSeatsResponse } from "./types.ts";
import {
  TOKEN_PLAN_AK_OPTIONS,
  TOKEN_PLAN_COMMON_QUERY_OPTIONS,
  TOKEN_PLAN_WORKSPACE_OPTION,
  appendCommonQueryParams,
  callTokenPlanApi,
  prepareTokenPlanRequest,
  requireWorkspaceId,
  resolveTokenPlanCredentials,
  type TokenPlanQueryParams,
} from "./utils.ts";

const API_ACTION = "BatchAssignSeats";
const API_PATH = "/tokenplan/subscription/seat-assignments";

export default defineCommand({
  name: "token-plan assign-seats",
  description: "Batch assign Token Plan seats to members",
  usage:
    "bl token-plan assign-seats --workspace-id <id> --seat-type <type> --account-id <id> [flags]",
  options: [
    TOKEN_PLAN_WORKSPACE_OPTION,
    {
      flag: "--seat-type <type>",
      description: "Seat tier: standard, pro, or max",
      required: true,
    },
    {
      flag: "--account-id <id>",
      description: "Target member account ID (repeatable)",
      type: "array",
    },
    ...TOKEN_PLAN_COMMON_QUERY_OPTIONS,
    {
      flag: "--locale <locale>",
      description: "Language: zh-CN or en-US",
    },
    ...TOKEN_PLAN_AK_OPTIONS,
  ],
  examples: [
    "bl token-plan assign-seats --workspace-id ws_456 --seat-type standard --account-id acc_123",
    "bl token-plan assign-seats --workspace-id ws_456 --seat-type pro --account-id acc_1 --account-id acc_2",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const credentials = resolveTokenPlanCredentials(config, flags);

    const workspaceId = requireWorkspaceId(config, flags);
    const seatType = flags.seatType as string | undefined;
    if (!seatType) {
      throw new BailianError("Missing required argument --seat-type.", ExitCode.USAGE);
    }

    const accountIds = flags.accountId as string[] | undefined;
    if (!accountIds || accountIds.length === 0) {
      throw new BailianError("Missing required argument --account-id.", ExitCode.USAGE);
    }

    const queryParams = buildQueryParams(flags, workspaceId);

    if (config.dryRun) {
      const { endpoint, queryParams: query } = prepareTokenPlanRequest(
        config,
        API_PATH,
        queryParams,
      );
      emitResult({ endpoint, query }, format);
      return;
    }

    const data = await callTokenPlanApi<BatchAssignSeatsResponse>({
      config,
      credentials,
      action: API_ACTION,
      path: API_PATH,
      method: "POST",
      queryParams,
    });

    if (config.quiet || format === "text") {
      emitBare("Seats assigned successfully.");
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(flags: GlobalFlags, workspaceId: string): TokenPlanQueryParams {
  const params: TokenPlanQueryParams = {};

  params.WorkspaceId = workspaceId;
  if (flags.seatType) params.SeatType = flags.seatType as string;
  appendCommonQueryParams(params, flags);
  if (flags.locale) params.Locale = flags.locale as string;

  const accountIds = flags.accountId as string[] | undefined;
  if (accountIds && accountIds.length > 0) {
    params.AccountIds = accountIds;
  }

  return params;
}
