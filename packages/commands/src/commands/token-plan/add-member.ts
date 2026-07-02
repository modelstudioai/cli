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
import type { AddOrganizationMemberResponse } from "./types.ts";
import {
  TOKEN_PLAN_AK_OPTIONS,
  TOKEN_PLAN_COMMON_QUERY_OPTIONS,
  appendCommonQueryParams,
  callTokenPlanApi,
  prepareTokenPlanRequest,
  resolveTokenPlanCredentials,
  type TokenPlanQueryParams,
} from "./utils.ts";

const API_ACTION = "AddOrganizationMember";
const API_PATH = "/tokenplan/organization/member-additions";

const DEFAULT_ORG_ROLE = "ORG_MEMBER";

export default defineCommand({
  description: "Add a member to a Token Plan organization",
  usageArgs: "--account-name <name> --org-id <id> [flags]",
  options: [
    { flag: "--account-name <name>", description: "Member display name", required: true },
    { flag: "--org-id <id>", description: "Organization ID", required: true },
    {
      flag: "--org-role-code <code>",
      description: "Organization role: ORG_ADMIN or ORG_MEMBER (default: ORG_MEMBER)",
    },
    {
      flag: "--spec-type <type>",
      description: "Seat tier to assign on creation: standard, pro, or max",
    },
    ...TOKEN_PLAN_COMMON_QUERY_OPTIONS,
    ...TOKEN_PLAN_AK_OPTIONS,
  ],
  exampleArgs: [
    "--account-name dev_user --org-id org_123",
    "--account-name admin_user --org-id org_123 --org-role-code ORG_ADMIN",
    "--account-name member1 --org-id org_123 --spec-type standard",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const credentials = resolveTokenPlanCredentials(config, flags);

    const accountName = flags.accountName as string | undefined;
    const orgId = flags.orgId as string | undefined;
    if (!accountName) {
      throw new BailianError("Missing required argument --account-name.", ExitCode.USAGE);
    }
    if (!orgId) {
      throw new BailianError("Missing required argument --org-id.", ExitCode.USAGE);
    }

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

    const data = await callTokenPlanApi<AddOrganizationMemberResponse>({
      config,
      credentials,
      action: API_ACTION,
      path: API_PATH,
      method: "POST",
      queryParams,
    });

    if (config.quiet || format === "text") {
      emitTextMember(data);
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(flags: GlobalFlags): TokenPlanQueryParams {
  const params: TokenPlanQueryParams = {};

  if (flags.accountName) params.AccountName = flags.accountName as string;
  if (flags.orgId) params.OrgId = flags.orgId as string;
  params.OrgRoleCode =
    typeof flags.orgRoleCode === "string" && flags.orgRoleCode.length > 0
      ? flags.orgRoleCode
      : DEFAULT_ORG_ROLE;
  if (flags.specType) params.SpecType = flags.specType as string;
  appendCommonQueryParams(params, flags);

  return params;
}

function emitTextMember(data: AddOrganizationMemberResponse): void {
  const item = data.Data;
  if (!item) {
    emitBare("Member added.");
    return;
  }

  emitBare(`${padEnd("AccountId", 14)} ${item.AccountId ?? "-"}`);
  emitBare(`${padEnd("SeatAssigned", 14)} ${String(item.SeatAssigned ?? "-")}`);
}
