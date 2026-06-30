import {
  REGIONS,
  maskToken,
  trackingHeaders,
  type Config,
  type GlobalFlags,
  type OptionDef,
  type Region,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { buildCanonicalQuery, signTokenPlanRequest } from "./ak-sign.ts";

export const TOKEN_PLAN_API_VERSION = "2026-02-10";

export const TOKEN_PLAN_AK_OPTIONS: OptionDef[] = [
  { flag: "--access-key-id <key>", description: "Alibaba Cloud Access Key ID (deprecated)" },
  {
    flag: "--access-key-secret <key>",
    description: "Alibaba Cloud Access Key Secret (deprecated)",
  },
];

export const TOKEN_PLAN_COMMON_QUERY_OPTIONS: OptionDef[] = [
  {
    flag: "--caller-uac-account-id <id>",
    description: "Caller UAC account ID",
  },
  {
    flag: "--namespace-id <id>",
    description: "Product namespace ID (Token Plan default: namespace-1)",
  },
];

export const TOKEN_PLAN_WORKSPACE_OPTION: OptionDef = {
  flag: "--workspace-id <id>",
  description: "Workspace ID (env: BAILIAN_WORKSPACE_ID, config: workspace_id)",
};

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

export function resolveTokenPlanCredentials(
  config: Config,
  flags: GlobalFlags,
): { accessKeyId: string; accessKeySecret: string } {
  const accessKeyId = (flags.accessKeyId as string) || config.accessKeyId;
  const accessKeySecret = (flags.accessKeySecret as string) || config.accessKeySecret;

  if (!accessKeyId || !accessKeySecret) {
    throw new BailianError(
      "No credentials found.\n" +
        "Set ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET.",
      ExitCode.AUTH,
    );
  }

  return { accessKeyId, accessKeySecret };
}

export function requireWorkspaceId(config: Config, flags: GlobalFlags): string {
  const workspaceId = (flags.workspaceId as string) || config.workspaceId;
  if (!workspaceId) {
    throw new BailianError(
      "Missing workspace ID.\n" +
        "Set via: --workspace-id flag, env: BAILIAN_WORKSPACE_ID, or config: bl config set workspace_id <id>",
      ExitCode.USAGE,
    );
  }
  return workspaceId;
}

export function appendCommonQueryParams(params: TokenPlanQueryParams, flags: GlobalFlags): void {
  if (flags.callerUacAccountId) params.CallerUacAccountId = flags.callerUacAccountId as string;
  if (flags.namespaceId) params.NamespaceId = flags.namespaceId as string;
}

export function prepareTokenPlanRequest(
  config: Config,
  path: string,
  queryParams: TokenPlanQueryParams,
): { host: string; endpoint: string; queryString: string; queryParams: TokenPlanQueryParams } {
  const queryString = buildCanonicalQuery(queryParams);
  const host = modelStudioHost(config.baseUrl);
  const endpoint = `https://${host}${path}${queryString ? `?${queryString}` : ""}`;
  return { host, endpoint, queryString, queryParams };
}

export async function callTokenPlanApi<T extends TokenPlanApiResponse>(opts: {
  config: Config;
  credentials: { accessKeyId: string; accessKeySecret: string };
  action: string;
  path: string;
  method: "GET" | "POST";
  queryParams: TokenPlanQueryParams;
}): Promise<T> {
  const { config, credentials, action, path, method, queryParams } = opts;
  const { host, endpoint, queryString } = prepareTokenPlanRequest(config, path, queryParams);

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

  if (config.verbose) {
    process.stderr.write(`> ${method} ${endpoint}\n`);
    process.stderr.write(`> AK: ${maskToken(credentials.accessKeyId)}\n`);
  }

  const timeoutMs = config.timeout * 1000;
  const res = await fetch(endpoint, {
    method,
    headers: { ...headers, ...trackingHeaders() },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (config.verbose) {
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
