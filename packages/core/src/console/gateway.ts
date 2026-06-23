import type { Config } from "../config/schema.ts";
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

export function isPreEnv(): boolean {
  return !!process.env.BAILIAN_PRE;
}

function applyPrePrefix(host: string): string {
  return isPreEnv() ? `pre-${host}` : host;
}

/** Resolved console gateway settings (same defaults as {@link callConsoleGateway}). */
export function effectiveConsoleGatewayConfig(config: Config): {
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
  /** Console region (e.g. cn-beijing, ap-southeast-1). Falls back to config.consoleRegion, then "cn-beijing". */
  region?: string;
  /** Console site. Falls back to config.consoleSite, then "domestic". */
  site?: ConsoleSite;
  /** Switch-agent UID for delegated access. Falls back to config.consoleSwitchAgent. */
  switchAgent?: number;
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
 * `token` is the console `access_token` (from `bl auth login --console`); when
 * omitted the request is sent without an Authorization header, which works for
 * public console APIs that don't require a login session.
 *
 * Gateway URL and action are resolved from `region + site` via {@link REGION_GATEWAYS}.
 * Each parameter falls back to the corresponding config value, then to a hardcoded default.
 */
export async function callConsoleGateway(
  config: Config,
  token: string | undefined,
  { api, data }: ConsoleGatewayRequest,
): Promise<unknown> {
  const {
    consoleRegion: effectiveRegion,
    consoleSite: effectiveSite,
    consoleSwitchAgent: effectiveSwitchAgent,
  } = effectiveConsoleGatewayConfig(config);

  const resolved = resolveGateway(effectiveRegion, effectiveSite);
  const gatewayBase = `https://${applyPrePrefix(resolved.csGateway)}`;
  const action = resolved.action;

  const params = buildGatewayParams(api, data, effectiveSwitchAgent);
  const body = new URLSearchParams({ params, region: effectiveRegion });
  const timeoutMs = config.timeout * 1000;

  const headers: Record<string, string> = {
    Accept: "*/*",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

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
    const errorCode = String(innerData.errorCode);
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
