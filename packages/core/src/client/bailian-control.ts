import type { Identity, Settings } from "../config/schema.ts";
import { Client, type OpenApiResponse } from "./client.ts";

const VERSION = "2024-08-16";
// BailianControl is a ROA-style product: each API has its own pathname
// (e.g. GetApiKey -> /bailianControl/apiKey/getApiKey), not the RPC `/`.
const CREATE_USER_ACTION = "CreateUser";
const CREATE_USER_PATH = "/bailianControl/User/createUser";
const LIST_WORKSPACES_ACTION = "ListWorkspaces";
const LIST_WORKSPACES_PATH = "/bailianControl/workspaces";
const RESET_POLICIES_ACTION = "ChangeUserPermissions";
const RESET_POLICIES_PATH = "/bailianControl/serviserAuthorityPolicy/resetPolicies4Agent";

function bailianControlHost(regionId: string): string {
  return `bailiancontrol.${regionId}.aliyuncs.com`;
}

/** Shared inputs for every BailianControl OpenAPI call (AK/SK passed explicitly). */
export interface BailianControlAuth {
  identity: Identity;
  settings: Settings;
  baseUrl: string;
  regionId: string;
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
}

function bailianControlClient(auth: BailianControlAuth): Client {
  return new Client({
    identity: auth.identity,
    settings: auth.settings,
    baseUrl: auth.baseUrl,
    openApiCred: {
      accessKeyId: auth.accessKeyId,
      accessKeySecret: auth.accessKeySecret,
      securityToken: auth.securityToken,
      source: "flag",
    },
  });
}

export interface CreateUserReqDTO {
  outerKey: string;
  nickName: string;
  userName: string;
}

/**
 * Create a Bailian console user via the BailianControl OpenAPI (`CreateUser`),
 * signed with Alibaba Cloud AK/SK. Mirrors {@link generateCLIAccessToken}: the
 * caller passes AK/SK explicitly, so this needs no stored credential.
 */
export async function createBailianControlUser(
  opts: BailianControlAuth & { reqDTO: CreateUserReqDTO },
): Promise<OpenApiResponse> {
  const client = bailianControlClient(opts);
  // The CreateUser request carries a single `data` param whose value is the
  // console payload re-encoded as a JSON string: {"data":"{\"reqDTO\":{...}}"}.
  return client.openApiJson({
    host: bailianControlHost(opts.regionId),
    path: CREATE_USER_PATH,
    action: CREATE_USER_ACTION,
    version: VERSION,
    method: "POST",
    body: { data: JSON.stringify({ reqDTO: opts.reqDTO }) },
  });
}

/** List workspaces (used to resolve the agent id for permission changes). */
export async function listBailianControlWorkspaces(
  opts: BailianControlAuth,
): Promise<OpenApiResponse> {
  const client = bailianControlClient(opts);
  // GET carries the console payload as a `data` query param, re-encoded as a
  // JSON string: ?data={"reqDTO":{}}.
  return client.openApiJson({
    host: bailianControlHost(opts.regionId),
    path: LIST_WORKSPACES_PATH,
    action: LIST_WORKSPACES_ACTION,
    version: VERSION,
    method: "GET",
    queryParams: {
      data: JSON.stringify({ reqDTO: {}, cornerstoneParam: {} }),
    },
  });
}

/**
 * Authorize a user's servicer permissions via `ResetPolicies4Agent`. The single
 * `data` param carries the console payload re-encoded as a JSON string.
 */
export async function resetBailianControlPolicies4Agent(
  opts: BailianControlAuth & {
    outerKey: string;
    agentId: number;
    policyIndexList?: number[];
  },
): Promise<OpenApiResponse> {
  const client = bailianControlClient(opts);
  return client.openApiJson({
    host: bailianControlHost(opts.regionId),
    path: RESET_POLICIES_PATH,
    action: RESET_POLICIES_ACTION,
    version: VERSION,
    method: "POST",
    body: {
      data: JSON.stringify({
        cornerstoneParam: {},
        outerKey: opts.outerKey,
        policyIndexList: opts.policyIndexList ?? [1],
        agentId: opts.agentId,
      }),
    },
  });
}
