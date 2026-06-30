import {
  defineCommand,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { padEnd } from "bailian-cli-runtime";
import type { CreateTokenPlanKeyResponse } from "./types.ts";
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

const API_ACTION = "CreateTokenPlanKey";
const API_PATH = "/tokenplan/api-keys";

export default defineCommand({
  description: "Create a Token Plan API key for a seat",
  usageArgs: "--account-id <id> --workspace-id <id> [flags]",
  options: [
    { flag: "--account-id <id>", description: "Target member account ID", required: true },
    TOKEN_PLAN_WORKSPACE_OPTION,
    { flag: "--description <text>", description: "API key description" },
    ...TOKEN_PLAN_COMMON_QUERY_OPTIONS,
    ...TOKEN_PLAN_AK_OPTIONS,
  ],
  exampleArgs: [
    "--account-id acc_123 --workspace-id ws_456",
    "--account-id acc_123 --workspace-id ws_456 --description 'Dev key'",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const credentials = resolveTokenPlanCredentials(config, flags);

    const accountId = flags.accountId as string | undefined;
    const workspaceId = requireWorkspaceId(config, flags);
    if (!accountId) {
      throw new BailianError("Missing required argument --account-id.", ExitCode.USAGE);
    }

    const queryParams = buildQueryParams(flags, { accountId, workspaceId });

    if (config.dryRun) {
      const { endpoint, queryParams: query } = prepareTokenPlanRequest(
        config,
        API_PATH,
        queryParams,
      );
      emitResult({ endpoint, query }, format);
      return;
    }

    const data = await callTokenPlanApi<CreateTokenPlanKeyResponse>({
      config,
      credentials,
      action: API_ACTION,
      path: API_PATH,
      method: "POST",
      queryParams,
    });

    if (config.quiet || format === "text") {
      emitTextKey(data);
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(
  flags: GlobalFlags,
  resolved: { accountId: string; workspaceId: string },
): TokenPlanQueryParams {
  const params: TokenPlanQueryParams = {};

  params.AccountId = resolved.accountId;
  params.WorkspaceId = resolved.workspaceId;
  if (flags.description) params.Description = flags.description as string;
  appendCommonQueryParams(params, flags);

  return params;
}

function emitTextKey(data: CreateTokenPlanKeyResponse): void {
  const item = data.Data;
  if (!item) {
    emitBare("API key created.");
    return;
  }

  emitBare(`${padEnd("ApiKeyId", 14)} ${item.ApiKeyId ?? "-"}`);
  emitBare(`${padEnd("MaskedApiKey", 14)} ${item.MaskedApiKey ?? "-"}`);
  if (item.Description) {
    emitBare(`${padEnd("Description", 14)} ${item.Description}`);
  }
  if (item.PlainApiKey) {
    emitBare("");
    emitBare(`PlainApiKey (shown once): ${item.PlainApiKey}`);
  }
}
