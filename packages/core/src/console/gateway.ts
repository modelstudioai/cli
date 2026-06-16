import type { Config } from "../config/schema.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

const GATEWAY_ACTION = "BroadScopeAspnGateway";
const GATEWAY_PRODUCT = "sfm_bailian";

export interface ConsoleGatewayRequest {
  /** Console API name, e.g. zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierQuota */
  api: string;
  data: Record<string, unknown>;
  /** Console region (default: cn-beijing), distinct from DashScope `config.region`. */
  region?: string;
}

function buildGatewayParams(api: string, data: Record<string, unknown>): string {
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
 */
export async function callConsoleGateway(
  config: Config,
  token: string | undefined,
  { api, data, region = "cn-beijing" }: ConsoleGatewayRequest,
): Promise<unknown> {
  const params = buildGatewayParams(api, data);
  const body = new URLSearchParams({ params, region });
  const timeoutMs = config.timeout * 1000;

  const gatewayBase = config.consoleGatewayUrl;

  const headers: Record<string, string> = {
    Accept: "*/*",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(
    `${gatewayBase}/cli/api.json?action=${GATEWAY_ACTION}&product=${GATEWAY_PRODUCT}&api=${encodeURIComponent(api)}`,
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
