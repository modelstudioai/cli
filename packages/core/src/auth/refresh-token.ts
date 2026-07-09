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
  baseUrl: string;
  accessKeyId: string;
  accessKeySecret: string;
}): Promise<any> {
  const { identity, settings, baseUrl, accessKeyId, accessKeySecret } = opts;

  const client = new Client({
    identity,
    settings,
    baseUrl,
    openApiCred: { accessKeyId, accessKeySecret, source: "flag" },
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
  baseUrl: string;
}): Promise<string | null> {
  const config = readConfigFile();
  const accessKeyId = config.access_key_id;
  const accessKeySecret = config.access_key_secret;
  if (!accessKeyId || !accessKeySecret) return null;

  if (opts.settings.verbose) {
    process.stderr.write("Refreshing access token...\n");
  }

  const resp = await generateCLIAccessToken({
    identity: opts.identity,
    settings: opts.settings,
    baseUrl: opts.baseUrl,
    accessKeyId,
    accessKeySecret,
  });

  const token: string | undefined = resp.cliAccessToken;
  if (!token) return null;

  const existing = readConfigFile() as Record<string, unknown>;
  existing.access_token = token;
  await writeConfigFile(existing);

  return token;
}
