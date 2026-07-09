import { Client, REGIONS, type Identity, type Region, type Settings } from "bailian-cli-core";

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

interface GenerateCLIAccessTokenResponse {
  Success?: boolean;
  Code?: string;
  Message?: string;
  Data?: Record<string, unknown>;
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

  return client.openApiQueryJson<GenerateCLIAccessTokenResponse>({
    host,
    path: API_PATH,
    action: API_ACTION,
    version: API_VERSION,
    method: "POST",
    queryParams: {},
  });
}
