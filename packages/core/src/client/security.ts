import { REGIONS } from "../config/schema.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { Client } from "./client.ts";

/**
 * Agent Security Center (AgentStudio) response envelope.
 *
 * Unlike DashScope's `{ code, message }` shape — which `requestJson` already
 * understands — AgentStudio reports failures as `{ success: false, errorCode,
 * errorMsg }` over HTTP 200, so it needs its own unwrap layer. Missing data is
 * not an error by contract: `success: true` with a null `data` is valid and
 * surfaces as `null` here rather than throwing.
 */
export interface SecurityEnvelope<T> {
  success: boolean;
  data: T | null;
  errorCode?: string;
  errorMsg?: string;
}

/** Documented AgentStudio error codes → actionable hint. */
const SECURITY_ERROR_HINTS: Record<string, string> = {
  "12000090": "STS credentials unavailable — retry in a moment",
  "12000091": "Service-linked role creation failed — retry",
  "12000092": "Use the primary account to create the service-linked role",
  "12000093": "Cloud security service is unavailable — retry later",
  "12000094": "Alert query failed — treat as no data",
};

/** The public DashScope gateway origins — the default model base URLs. */
const DASHSCOPE_GATEWAY_ORIGINS = new Set<string>(Object.values(REGIONS));

/**
 * Whether an origin is a public DashScope gateway. The security commands derive
 * their per-workspace AgentStudio host by default, so a base URL that is just
 * the DashScope gateway is the default and is ignored; any other origin
 * (pre-release / private / mock) is treated as an explicit host override.
 */
export function isDashScopeGateway(origin: string): boolean {
  return DASHSCOPE_GATEWAY_ORIGINS.has(origin.replace(/\/+$/, ""));
}

/**
 * GET a Security Center endpoint and unwrap its envelope.
 *
 * `url` is an absolute per-workspace AgentStudio URL (see `securityOverviewEndpoint`
 * / `securityAgentLogsEndpoint`); the Client detects the absolute form, uses it
 * verbatim, and injects the Bearer token — so the model-domain `base_url` never
 * leaks into these calls. Genuine HTTP errors (non-2xx) surface through the
 * Client transport; only HTTP 200 envelopes reach the `success` check below.
 * Returns null when the server reports success with no data.
 */
export async function securityGet<T>(client: Client, url: string): Promise<T | null> {
  const response = await client.request({ path: url, method: "GET" });

  let body: SecurityEnvelope<T>;
  try {
    body = (await response.json()) as SecurityEnvelope<T>;
  } catch {
    const contentType = response.headers.get("content-type") || "unknown type";
    throw new BailianError(
      `Security API returned non-JSON response (${contentType}).`,
      ExitCode.GENERAL,
    );
  }

  if (!body.success) {
    const code = body.errorCode ?? "unknown";
    throw new BailianError(
      `Security API failed: ${code} - ${body.errorMsg ?? "no message"}`,
      // 12000092 (no permission to create the service-linked role) is an auth
      // problem the caller can act on; everything else is a generic failure.
      code === "12000092" ? ExitCode.AUTH : ExitCode.GENERAL,
      SECURITY_ERROR_HINTS[code],
    );
  }

  return body.data ?? null;
}
