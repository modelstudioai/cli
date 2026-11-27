import type { HttpDeps } from "../client/http.ts";
import type { Identity, Settings } from "../config/schema.ts";
import { validatePreConsoleScope } from "../config/control-plane.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { callConsoleGateway, type ConsoleGatewayTarget } from "../console/gateway.ts";
import { readConfigFile, mutateConfigFile } from "../config/loader.ts";
import { getConfigPath } from "../config/paths.ts";
import { Client } from "../client/client.ts";
import type { OpenApiCredential } from "./types.ts";

const API_VERSION = "2026-02-10";
const API_ACTION = "GenerateCLIAccessToken";
const API_PATH = "/modelstudio/cli/generateAccessToken";

const MODEL_STUDIO_HOSTS = new Map([
  ["cn-beijing", "modelstudio.cn-beijing.aliyuncs.com"],
  ["ap-southeast-1", "modelstudio.ap-southeast-1.aliyuncs.com"],
]);

export function resolveModelStudioHost(region: string): string | undefined {
  return MODEL_STUDIO_HOSTS.get(region);
}

/** Console 目标优先；仅在地域缺省时从已知模型域名推导，不猜测未知站点。 */
export function resolveCLIAccessTokenTarget(
  settings: Pick<
    Settings,
    "consoleRegion" | "consoleSite" | "consoleSwitchAgent" | "preControlPlane"
  >,
  baseUrl: string,
): Omit<ConsoleGatewayTarget, "token"> {
  if (settings.preControlPlane) {
    validatePreConsoleScope({ region: settings.consoleRegion, site: settings.consoleSite });
    return { region: "cn-beijing", site: "domestic", switchAgent: settings.consoleSwitchAgent };
  }
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
  options: Pick<HttpDeps, "debug"> & { signal?: AbortSignal } = {},
): Promise<void> {
  const response = (await callConsoleGateway(
    target,
    settings.timeout,
    { api: "zeldaEasy.cornerstone-portal.cs-console.loginInfo", data: {} },
    { ...options, preControlPlane: settings.preControlPlane },
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

export type GenerateCLIAccessTokenOptions = {
  identity: Identity;
  settings: Settings;
  debug?: HttpDeps["debug"];
  baseUrl: string;
  modelStudioHost?: string;
  signal?: AbortSignal;
} & (
  | { client: Client; accessKeyId?: never; accessKeySecret?: never; securityToken?: never }
  | {
      client?: undefined;
      accessKeyId: string;
      accessKeySecret: string;
      securityToken?: string;
    }
);

export async function generateCLIAccessToken(opts: GenerateCLIAccessTokenOptions) {
  const { identity, settings, baseUrl, accessKeyId, accessKeySecret, securityToken } = opts;

  const client =
    opts.client ??
    new Client({
      identity,
      settings,
      debug: opts.debug,
      baseUrl,
      openApiCred: {
        accessKeyId: accessKeyId!,
        accessKeySecret: accessKeySecret!,
        securityToken,
        source: "flag",
      },
    });

  const target = resolveCLIAccessTokenTarget(settings, baseUrl);
  const host = opts.modelStudioHost ?? resolveModelStudioHost(target.region)!;

  const response = await client.openApiQueryJson<{ cliAccessToken?: unknown; Success?: boolean }>({
    host,
    path: API_PATH,
    action: API_ACTION,
    version: API_VERSION,
    method: "POST",
    queryParams: {},
    signal: opts.signal,
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
 * Obtain a Console token using resolved AK/SK, or selected-config AK/SK for legacy callers.
 * Returns the new token on success, or null if AK/SK are not available.
 */
export async function refreshAccessToken(opts: {
  identity: Identity;
  settings: Settings;
  debug?: HttpDeps["debug"];
  baseUrl: string;
  /** 重试原请求作为验证；独立调用时默认通过只读 loginInfo 校验。 */
  validateToken?: (token: string) => Promise<void>;
  /** Already selected by the shared credential chain; legacy callers use the selected config. */
  credential?: OpenApiCredential;
  modelStudioHost?: string;
  /** Defaults to persistence only for local config credentials; temporary credentials stay in memory. */
  persist?: boolean;
}): Promise<string | null> {
  const configName = opts.settings.configName;
  const configurationPath =
    opts.settings.configPath ?? getConfigPath(opts.settings.preControlPlane);
  const config =
    !opts.credential ||
    (opts.credential.source === "config" && opts.credential.method !== "aliyun-oauth")
      ? readConfigFile(configName, configurationPath)
      : undefined;
  const accessKeyId = opts.credential?.accessKeyId ?? config?.access_key_id;
  const accessKeySecret = opts.credential?.accessKeySecret ?? config?.access_key_secret;
  if (!accessKeyId || !accessKeySecret) return null;

  opts.debug?.({ message: { "en-US": "Refreshing access token", "zh-CN": "正在刷新访问令牌" } });

  const resp = await generateCLIAccessToken({
    identity: opts.identity,
    settings: opts.settings,
    debug: opts.debug,
    baseUrl: opts.baseUrl,
    accessKeyId,
    accessKeySecret,
    securityToken: opts.credential ? opts.credential.securityToken : config?.security_token,
    modelStudioHost: opts.modelStudioHost,
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

  const persist =
    opts.credential?.method !== "aliyun-oauth" &&
    (opts.persist ?? (!opts.credential || opts.credential.source === "config"));
  if (persist)
    await persistConsoleAccessToken(
      token,
      configName,
      configurationPath,
      config
        ? {
            token: config.access_token,
            accessKeyId: config.access_key_id,
            accessKeySecret: config.access_key_secret,
          }
        : undefined,
    );

  return token;
}

/** Called only after a successful Console validation or business request. */
export async function persistConsoleAccessToken(
  token: string,
  configName?: string,
  path = getConfigPath(),
  expected?: { token?: string; accessKeyId?: string; accessKeySecret?: string },
): Promise<void> {
  await mutateConfigFile(
    (current) => {
      if (
        expected &&
        (current.access_token !== expected.token ||
          (expected.accessKeyId !== undefined && current.access_key_id !== expected.accessKeyId) ||
          (expected.accessKeySecret !== undefined &&
            current.access_key_secret !== expected.accessKeySecret))
      )
        return undefined;
      return { ...current, access_token: token };
    },
    configName,
    { path },
  );
}
