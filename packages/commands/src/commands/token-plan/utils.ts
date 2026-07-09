import {
  REGIONS,
  buildAcsCanonicalQuery,
  type Client,
  type AcsQueryParams,
  type FlagsDef,
  type ParsedFlags,
  type Region,
  type Settings,
  BailianError,
  ExitCode,
} from "bailian-cli-core";

export const TOKEN_PLAN_API_VERSION = "2026-02-10";

export const TOKEN_PLAN_COMMON_QUERY_FLAGS = {
  callerUacAccountId: {
    type: "string",
    valueHint: "<id>",
    description: "Caller UAC account ID",
  },
  namespaceId: {
    type: "string",
    valueHint: "<id>",
    description: "Product namespace ID (Token Plan default: namespace-1)",
  },
} satisfies FlagsDef;

export const TOKEN_PLAN_WORKSPACE_FLAG = {
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: "Workspace ID (env: BAILIAN_WORKSPACE_ID, config: workspace_id)",
  },
} satisfies FlagsDef;

type TokenPlanCommonQueryFlags = ParsedFlags<typeof TOKEN_PLAN_COMMON_QUERY_FLAGS>;

const MODEL_STUDIO_HOSTS: Partial<Record<Region, string>> = {
  cn: "modelstudio.cn-beijing.aliyuncs.com",
  intl: "modelstudio.ap-southeast-1.aliyuncs.com",
};

function resolveRegion(baseUrl: string): Region {
  for (const [region, url] of Object.entries(REGIONS) as Array<[Region, string]>) {
    if (baseUrl === url || baseUrl.startsWith(`${url}/`)) return region;
  }
  return "cn";
}

/** ModelStudio OpenAPI host for the given DashScope base URL preset. */
function modelStudioHost(baseUrl: string): string {
  const region = resolveRegion(baseUrl);
  return MODEL_STUDIO_HOSTS[region] ?? MODEL_STUDIO_HOSTS.cn!;
}

export interface TokenPlanApiResponse {
  Success?: boolean;
  Code?: string;
  Message?: string;
}

export type TokenPlanQueryParams = AcsQueryParams;

export function requireWorkspaceId(
  settings: Settings,
  flags: { workspaceId?: string },
  binName: string,
): string {
  const workspaceId = flags.workspaceId || settings.workspaceId;
  if (!workspaceId) {
    throw new BailianError(
      "Missing workspace ID.\n" +
        `Set via: --workspace-id flag, env: BAILIAN_WORKSPACE_ID, or config: ${binName} config set workspace_id <id>`,
      ExitCode.USAGE,
    );
  }
  return workspaceId;
}

export function appendCommonQueryParams(
  params: TokenPlanQueryParams,
  flags: TokenPlanCommonQueryFlags,
): void {
  if (flags.callerUacAccountId) params.CallerUacAccountId = flags.callerUacAccountId;
  if (flags.namespaceId) params.NamespaceId = flags.namespaceId;
}

export function prepareTokenPlanRequest(
  baseUrl: string,
  path: string,
  queryParams: TokenPlanQueryParams,
): { host: string; endpoint: string; queryString: string; queryParams: TokenPlanQueryParams } {
  const queryString = buildAcsCanonicalQuery(queryParams);
  const host = modelStudioHost(baseUrl);
  const endpoint = `https://${host}${path}${queryString ? `?${queryString}` : ""}`;
  return { host, endpoint, queryString, queryParams };
}

export async function callTokenPlanApi<T extends TokenPlanApiResponse>(opts: {
  client: Client;
  /** Model-domain base URL (from ctx.client.baseUrl) — only used to pick the OpenAPI host region. */
  baseUrl: string;
  action: string;
  path: string;
  method: "GET" | "POST";
  queryParams: TokenPlanQueryParams;
}): Promise<T> {
  const { client, baseUrl, action, path, method, queryParams } = opts;
  const { host } = prepareTokenPlanRequest(baseUrl, path, queryParams);
  return client.openApiQueryJson<T>({
    host,
    path,
    action,
    version: TOKEN_PLAN_API_VERSION,
    method,
    queryParams,
  });
}
