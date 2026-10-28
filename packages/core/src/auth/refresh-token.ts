import type { HttpDeps } from "../client/http.ts";
import { REGIONS, type Region } from "../config/schema.ts";
import type { Identity, Settings } from "../config/schema.ts";
import { readConfigFile, writeConfigFile } from "../config/loader.ts";
import { Client } from "../client/client.ts";

const API_VERSION = "2026-02-10";
const API_ACTION = "GenerateCLIAccessToken";
const API_PATH = "/modelstudio/cli/generateAccessToken";

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

function modelStudioHost(baseUrl: string): string {
  const region = resolveRegion(baseUrl);
  return MODEL_STUDIO_HOSTS[region] ?? MODEL_STUDIO_HOSTS.cn!;
}

export async function generateCLIAccessToken(opts: {
  identity: Identity;
  settings: Settings;
  // TODO(output-contract): Pass ctx.output.debug from auth generate-access-token, auth login and workspace init.
  debug?: HttpDeps["debug"];
  baseUrl: string;
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
}): Promise<any> {
  const { identity, settings, baseUrl, accessKeyId, accessKeySecret, securityToken } = opts;

  const client = new Client({
    identity,
    settings,
    debug: opts.debug,
    baseUrl,
    openApiCred: { accessKeyId, accessKeySecret, securityToken, source: "flag" },
  });

  const host = modelStudioHost(baseUrl);

  return client.openApiQueryJson({
    host,
    path: API_PATH,
    action: API_ACTION,
    version: API_VERSION,
    method: "POST",
    queryParams: {},
  });
}

/**
 * Try to refresh the console access_token using stored AK/SK.
 * Returns the new token on success, or null if AK/SK are not available.
 */
export async function refreshAccessToken(opts: {
  identity: Identity;
  settings: Settings;
  debug?: HttpDeps["debug"];
  baseUrl: string;
}): Promise<string | null> {
  const configName = opts.settings.configName;
  const config = readConfigFile(configName);
  const accessKeyId = config.access_key_id;
  const accessKeySecret = config.access_key_secret;
  if (!accessKeyId || !accessKeySecret) return null;

  opts.debug?.({ message: { "en-US": "Refreshing access token", "zh-CN": "正在刷新访问令牌" } });

  const resp = await generateCLIAccessToken({
    identity: opts.identity,
    settings: opts.settings,
    debug: opts.debug,
    baseUrl: opts.baseUrl,
    accessKeyId,
    accessKeySecret,
  });

  const token: string | undefined = resp.cliAccessToken;
  if (!token) return null;

  const existing = readConfigFile(configName) as Record<string, unknown>;
  existing.access_token = token;
  await writeConfigFile(existing, configName);

  return token;
}
