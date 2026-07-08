import {
  defineCommand,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult, emitBare, padEnd } from "bailian-cli-runtime";
import type { CreateTokenPlanKeyResponse } from "./types.ts";
import {
  TOKEN_PLAN_AK_FLAGS,
  TOKEN_PLAN_COMMON_QUERY_FLAGS,
  TOKEN_PLAN_WORKSPACE_FLAG,
  appendCommonQueryParams,
  callTokenPlanApi,
  prepareTokenPlanRequest,
  requireWorkspaceId,
  resolveTokenPlanCredentials,
  type TokenPlanQueryParams,
} from "./utils.ts";

const API_ACTION = "CreateTokenPlanKey";
const API_PATH = "/tokenplan/api-keys";

const CREATE_KEY_FLAGS = {
  accountId: {
    type: "string",
    valueHint: "<id>",
    description: "Target member account ID",
    required: true,
  },
  ...TOKEN_PLAN_WORKSPACE_FLAG,
  description: { type: "string", valueHint: "<text>", description: "API key description" },
  ...TOKEN_PLAN_COMMON_QUERY_FLAGS,
  ...TOKEN_PLAN_AK_FLAGS,
} satisfies FlagsDef;
type CreateKeyFlags = ParsedFlags<typeof CREATE_KEY_FLAGS>;

export default defineCommand({
  description: "Create a Token Plan API key for a seat",
  // AK/SK 私有解析(见 utils.ts),不走集中凭证域。
  auth: "none",
  usageArgs: "--account-id <id> --workspace-id <id> [flags]",
  flags: CREATE_KEY_FLAGS,
  exampleArgs: [
    "--account-id acc_123 --workspace-id ws_456",
    "--account-id acc_123 --workspace-id ws_456 --description 'Dev key'",
  ],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const workspaceId = requireWorkspaceId(settings, flags, identity.binName);
    const queryParams = buildQueryParams(flags, { accountId: flags.accountId, workspaceId });

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
    const data = await callTokenPlanApi<CreateTokenPlanKeyResponse>({
      settings,
      baseUrl: ctx.client.baseUrl,
      credentials,
      action: API_ACTION,
      path: API_PATH,
      method: "POST",
      queryParams,
    });

    if (settings.quiet || format === "text") {
      emitTextKey(data);
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(
  flags: CreateKeyFlags,
  resolved: { accountId: string; workspaceId: string },
): TokenPlanQueryParams {
  const params: TokenPlanQueryParams = {};

  params.AccountId = resolved.accountId;
  params.WorkspaceId = resolved.workspaceId;
  if (flags.description) params.Description = flags.description;
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
