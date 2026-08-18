import {
  defineCommand,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult, emitBare, padEnd } from "bailian-cli-runtime";
import type { AddOrganizationMemberResponse } from "./types.ts";
import {
  TOKEN_PLAN_COMMON_QUERY_FLAGS,
  appendCommonQueryParams,
  callTokenPlanApi,
  prepareTokenPlanRequest,
  type TokenPlanQueryParams,
} from "./utils.ts";

const API_ACTION = "AddOrganizationMember";
const API_PATH = "/tokenplan/organization/member-additions";

const DEFAULT_ORG_ROLE = "ORG_MEMBER";

const ADD_MEMBER_FLAGS = {
  accountName: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Member display name", "zh-CN": "成员显示名称" },
    required: true,
  },
  orgId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Organization ID", "zh-CN": "组织 ID" },
    required: true,
  },
  orgRoleCode: {
    type: "string",
    valueHint: "<code>",
    description: {
      "en-US": "Organization role: ORG_ADMIN or ORG_MEMBER (default: ORG_MEMBER)",
      "zh-CN": "组织角色：ORG_ADMIN 或 ORG_MEMBER（默认：ORG_MEMBER）",
    },
  },
  specType: {
    type: "string",
    valueHint: "<type>",
    description: {
      "en-US": "Seat tier to assign on creation: standard, pro, or max",
      "zh-CN": "创建时分配的席位档位：standard、pro 或 max",
    },
  },
  ...TOKEN_PLAN_COMMON_QUERY_FLAGS,
} satisfies FlagsDef;
type AddMemberFlags = ParsedFlags<typeof ADD_MEMBER_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Add a member to a Token Plan organization",
    "zh-CN": "向 Token Plan 组织添加成员",
  },
  auth: "openapi",
  usageArgs: "--account-name <name> --org-id <id> [flags]",
  flags: ADD_MEMBER_FLAGS,
  exampleArgs: [
    "--account-name dev_user --org-id org_123",
    "--account-name admin_user --org-id org_123 --org-role-code ORG_ADMIN",
    "--account-name member1 --org-id org_123 --spec-type standard",
  ],
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

    const data = await callTokenPlanApi<AddOrganizationMemberResponse>({
      client: ctx.client,
      baseUrl: ctx.client.baseUrl,
      action: API_ACTION,
      path: API_PATH,
      method: "POST",
      queryParams,
    });

    if (settings.quiet || format === "text") {
      emitTextMember(data);
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(flags: AddMemberFlags): TokenPlanQueryParams {
  const params: TokenPlanQueryParams = {};

  if (flags.accountName) params.AccountName = flags.accountName;
  if (flags.orgId) params.OrgId = flags.orgId;
  params.OrgRoleCode = flags.orgRoleCode || DEFAULT_ORG_ROLE;
  if (flags.specType) params.SpecType = flags.specType;
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
