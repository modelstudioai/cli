import type { Settings } from "../config/schema.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

const GATEWAY_PRODUCT = "sfm_bailian";

export type ConsoleSite = "domestic" | "international";

interface ConsoleGatewayInfo {
  csGateway: string;
  action: string;
}

const REGION_GATEWAYS: Record<string, Record<ConsoleSite, ConsoleGatewayInfo>> = {
  "cn-beijing": {
    domestic: { csGateway: "bailian-cs.console.aliyun.com", action: "BroadScopeAspnGateway" },
    international: {
      csGateway: "bailian-cs.console.alibabacloud.com",
      action: "BroadScopeAspnGateway",
    },
  },
  "ap-southeast-1": {
    domestic: {
      csGateway: "modelstudio-cs.console.aliyun.com",
      action: "IntlBroadScopeAspnGateway",
    },
    international: {
      csGateway: "bailian-singapore-cs.alibabacloud.com",
      action: "IntlBroadScopeAspnGateway",
    },
  },
};

function resolveGateway(region: string, site: ConsoleSite): ConsoleGatewayInfo {
  return REGION_GATEWAYS[region]?.[site] ?? REGION_GATEWAYS["cn-beijing"]![site];
}

/**
 * Resolved console gateway settings (same defaults as {@link callConsoleGateway}).
 * 参数只需 settings 的 console 三元组;dry-run 展示分支直接传 settings。
 */
export function effectiveConsoleGatewayConfig(
  config: Pick<Settings, "consoleRegion" | "consoleSite" | "consoleSwitchAgent">,
): {
  consoleRegion: string;
  consoleSite: ConsoleSite;
  consoleSwitchAgent?: number;
} {
  const consoleRegion = config.consoleRegion ?? "cn-beijing";
  const consoleSite = config.consoleSite ?? "domestic";
  const consoleSwitchAgent = config.consoleSwitchAgent;
  return consoleSwitchAgent != null
    ? { consoleRegion, consoleSite, consoleSwitchAgent }
    : { consoleRegion, consoleSite };
}

export interface ConsoleGatewayRequest {
  /** Console API name, e.g. zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierQuota */
  api: string;
  data: Record<string, unknown>;
}

function buildGatewayParams(
  api: string,
  data: Record<string, unknown>,
  switchAgent?: number,
): string {
  return JSON.stringify({
    Api: api,
    V: "1.0",
    Data: {
      ...data,
      cornerstoneParam: {
        protocol: "V2",
        console: "ONE_CONSOLE",
        productCode: "p_efm",
        consoleSite: "BAILIAN_ALIYUN",
        ...(switchAgent != null ? { switchAgent } : {}),
        ...(typeof data.cornerstoneParam === "object" && data.cornerstoneParam !== null
          ? (data.cornerstoneParam as Record<string, unknown>)
          : {}),
      },
    },
  });
}

/**
 * Invoke a Bailian **console** OpenAPI via the CLI gateway (`/cli/api.json`).
 * 目标(region/site/switchAgent)与 token 均由调用方解析后传入:Client.console 传
 * ConsoleCredential;公共目录类 API(如 advisor 的模型目录)可不带 token 匿名调用。
 */
export interface ConsoleGatewayTarget {
  region: string;
  site: ConsoleSite;
  switchAgent?: number;
  token?: string;
}

export async function callConsoleGateway(
  target: ConsoleGatewayTarget,
  timeoutSec: number,
  { api, data }: ConsoleGatewayRequest,
): Promise<unknown> {
  const resolved = resolveGateway(target.region, target.site);
  const gatewayBase = `https://${resolved.csGateway}`;
  const action = resolved.action;

  const params = buildGatewayParams(api, data, target.switchAgent);
  const body = new URLSearchParams({ params, region: target.region });
  const timeoutMs = timeoutSec * 1000;

  const headers: Record<string, string> = {
    Accept: "*/*",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (target.token) headers.Authorization = `Bearer ${target.token}`;

  const res = await fetch(
    `${gatewayBase}/cli/api.json?action=${action}&product=${GATEWAY_PRODUCT}&api=${encodeURIComponent(api)}`,
    {
      method: "POST",
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new BailianError(
      `Console CLI gateway failed: HTTP ${res.status} ${res.statusText}`,
      ExitCode.GENERAL,
      t.slice(0, 500),
    );
  }

  const json = (await res.json()) as Record<string, unknown>;

  const innerData = json.data as Record<string, unknown> | undefined;
  if (innerData?.success === false && innerData.errorCode) {
    const errorCode = String(innerData.errorCode as string | number);
    const notLogined = errorCode.includes("NotLogined");
    const errorMsg = typeof innerData.errorMsg === "string" ? innerData.errorMsg : undefined;
    throw new BailianError(
      notLogined
        ? "Console session is not logged in or has expired."
        : `Console gateway error: ${errorCode}`,
      notLogined ? ExitCode.AUTH : ExitCode.GENERAL,
      notLogined
        ? "Run `bl auth login --console` to sign in or refresh your console session."
        : errorMsg && errorMsg !== errorCode
          ? errorMsg
          : undefined,
    );
  }

  return json;
}
