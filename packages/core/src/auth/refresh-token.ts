import type { HttpDeps } from "../client/http.ts";
import type { Identity, Settings } from "../config/schema.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { callConsoleGateway, type ConsoleGatewayTarget } from "../console/gateway.ts";
import { readConfigFile, writeConfigFile } from "../config/loader.ts";
import { Client } from "../client/client.ts";

const API_VERSION = "2026-02-10";
const API_ACTION = "GenerateCLIAccessToken";
const API_PATH = "/modelstudio/cli/generateAccessToken";

const MODEL_STUDIO_HOSTS = new Map([
  ["cn-beijing", "modelstudio.cn-beijing.aliyuncs.com"],
  ["ap-southeast-1", "modelstudio.ap-southeast-1.aliyuncs.com"],
]);

/** Console 目标优先；仅在地域缺省时从已知模型域名推导，不猜测未知站点。 */
export function resolveCLIAccessTokenTarget(
  settings: Pick<Settings, "consoleRegion" | "consoleSite" | "consoleSwitchAgent">,
  baseUrl: string,
): Omit<ConsoleGatewayTarget, "token"> {
  let region = settings.consoleRegion;
  if (!region) {
    let hostname: string | undefined;
    try {
      hostname = new URL(baseUrl).hostname;
    } catch {
      // 无法识别的地址统一走下方地域校验。
    }
    if (hostname === "dashscope.aliyuncs.com") region = "cn-beijing";
    else if (hostname === "dashscope-intl.aliyuncs.com") region = "ap-southeast-1";
    else
      region = hostname?.match(
        /^[a-z0-9-]+\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/,
      )?.[1];
  }
  if (!region || !MODEL_STUDIO_HOSTS.has(region)) {
    throw new BailianError(
      "Cannot resolve a supported CLI token region. / 无法确定受支持的 CLI token 地域。",
      ExitCode.USAGE,
      "Set console_region to cn-beijing or ap-southeast-1. / 请配置 console_region 为 cn-beijing 或 ap-southeast-1。",
    );
  }
  return {
    region,
    site: settings.consoleSite ?? "domestic",
    switchAgent: settings.consoleSwitchAgent,
  };
}

/** 首次登录只读验证；直接调用网关，避免错误触发递归刷新。 */
export async function validateConsoleAccessToken(
  target: ConsoleGatewayTarget,
  settings: Settings,
  diagnostics: Pick<HttpDeps, "debug"> = {},
): Promise<void> {
  const response = (await callConsoleGateway(
    target,
    settings.timeout,
    { api: "zeldaEasy.cornerstone-portal.cs-console.loginInfo", data: {} },
    diagnostics,
  )) as { data?: { success?: boolean } } | null;
  if (response?.data?.success !== true) {
    throw new BailianError(
      "Console token validation did not return success. / 控制台 token 校验未返回成功结果。",
      ExitCode.GENERAL,
      undefined,
      { rawResponse: JSON.stringify(response) },
    );
  }
}

export async function generateCLIAccessToken(opts: {
  identity: Identity;
  settings: Settings;
  debug?: HttpDeps["debug"];
  baseUrl: string;
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
}) {
  const { identity, settings, baseUrl, accessKeyId, accessKeySecret, securityToken } = opts;

  const client = new Client({
    identity,
    settings,
    debug: opts.debug,
    baseUrl,
    openApiCred: { accessKeyId, accessKeySecret, securityToken, source: "flag" },
  });

  const target = resolveCLIAccessTokenTarget(settings, baseUrl);
  const host = MODEL_STUDIO_HOSTS.get(target.region)!;

  const response = await client.openApiQueryJson<{ cliAccessToken?: unknown; Success?: boolean }>({
    host,
    path: API_PATH,
    action: API_ACTION,
    version: API_VERSION,
    method: "POST",
    queryParams: {},
  });
  if (typeof response.cliAccessToken !== "string" || !response.cliAccessToken.trim()) {
    throw new BailianError(
      "CLI token response is missing cliAccessToken. / CLI token 响应缺少有效的 cliAccessToken。",
      ExitCode.GENERAL,
    );
  }
  return { ...response, cliAccessToken: response.cliAccessToken.trim() };
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
  /** 重试原请求作为验证；独立调用时默认通过只读 loginInfo 校验。 */
  validateToken?: (token: string) => Promise<void>;
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
    securityToken: config.security_token,
  });

  const token = resp.cliAccessToken;
  if (opts.validateToken) {
    await opts.validateToken(token);
  } else {
    await validateConsoleAccessToken(
      { ...resolveCLIAccessTokenTarget(opts.settings, opts.baseUrl), token },
      opts.settings,
      { debug: opts.debug },
    );
  }

  const existing = readConfigFile(configName) as Record<string, unknown>;
  existing.access_token = token;
  await writeConfigFile(existing, configName);

  return token;
}
