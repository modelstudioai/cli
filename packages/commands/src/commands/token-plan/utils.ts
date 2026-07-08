import {
  REGIONS,
  maskToken,
  trackingHeaders,
  type FlagsDef,
  type ParsedFlags,
  type Region,
  type Settings,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { buildCanonicalQuery, signTokenPlanRequest } from "./ak-sign.ts";

export const TOKEN_PLAN_API_VERSION = "2026-02-10";

/**
 * Token Plan 走阿里云 AK/SK（ACS3 POP 签名），不在集中凭证域（apiKey/console）内；
 * 命令声明 `auth: "none"`，凭证由本模块按 flag > env 私有解析。后续如收编成
 * 独立 auth 域，收口点在这里。
 */
export const TOKEN_PLAN_AK_FLAGS = {
  accessKeyId: {
    type: "string",
    valueHint: "<key>",
    description: "Alibaba Cloud Access Key ID (env: ALIBABA_CLOUD_ACCESS_KEY_ID)",
  },
  accessKeySecret: {
    type: "string",
    valueHint: "<key>",
    description: "Alibaba Cloud Access Key Secret (env: ALIBABA_CLOUD_ACCESS_KEY_SECRET)",
  },
} satisfies FlagsDef;

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

type TokenPlanAkFlags = ParsedFlags<typeof TOKEN_PLAN_AK_FLAGS>;
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

/** ModelStudio POP OpenAPI host for the given DashScope base URL preset. */
function modelStudioHost(baseUrl: string): string {
  const region = resolveRegion(baseUrl);
  return MODEL_STUDIO_HOSTS[region] ?? MODEL_STUDIO_HOSTS.cn!;
}

export interface TokenPlanApiResponse {
  Success?: boolean;
  Code?: string;
  Message?: string;
}

export type TokenPlanQueryParams = Record<string, string | string[] | undefined>;

export function resolveTokenPlanCredentials(flags: TokenPlanAkFlags): {
  accessKeyId: string;
  accessKeySecret: string;
} {
  const accessKeyId = flags.accessKeyId || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim();
  const accessKeySecret =
    flags.accessKeySecret || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim();

  if (!accessKeyId || !accessKeySecret) {
    throw new BailianError(
      "No credentials found.\n" +
        "Set ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET.",
      ExitCode.AUTH,
    );
  }

  return { accessKeyId, accessKeySecret };
}

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
  const queryString = buildCanonicalQuery(queryParams);
  const host = modelStudioHost(baseUrl);
  const endpoint = `https://${host}${path}${queryString ? `?${queryString}` : ""}`;
  return { host, endpoint, queryString, queryParams };
}

export async function callTokenPlanApi<T extends TokenPlanApiResponse>(opts: {
  settings: Settings;
  /** Model-domain base URL (from ctx.client.baseUrl) — only used to pick the POP host region. */
  baseUrl: string;
  credentials: { accessKeyId: string; accessKeySecret: string };
  action: string;
  path: string;
  method: "GET" | "POST";
  queryParams: TokenPlanQueryParams;
}): Promise<T> {
  const { settings, baseUrl, credentials, action, path, method, queryParams } = opts;
  const { host, endpoint, queryString } = prepareTokenPlanRequest(baseUrl, path, queryParams);

  const headers = signTokenPlanRequest({
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    action,
    version: TOKEN_PLAN_API_VERSION,
    body: "",
    host,
    pathname: path,
    method,
    queryString,
  });

  if (settings.verbose) {
    process.stderr.write(`> ${method} ${endpoint}\n`);
    process.stderr.write(`> AK: ${maskToken(credentials.accessKeyId)}\n`);
  }

  const timeoutMs = settings.timeout * 1000;
  const res = await fetch(endpoint, {
    method,
    headers: { ...headers, ...trackingHeaders() },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (settings.verbose) {
    process.stderr.write(`< ${res.status} ${res.statusText}\n`);
  }

  const data = (await res.json()) as T;

  if (!res.ok || data.Success === false) {
    throw new BailianError(
      `${data.Code || res.status} - ${data.Message || res.statusText}`,
      ExitCode.GENERAL,
    );
  }

  return data;
}
