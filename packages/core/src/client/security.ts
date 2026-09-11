import { REGIONS } from "../config/schema.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { Client } from "./client.ts";

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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** First non-empty string among the candidates, else undefined (treats "" as absent). */
function firstNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

function throwSecurityFailure(
  errorCode: string | undefined,
  errorMsg: string | undefined,
  rawResponse: string,
): never {
  const code = errorCode ?? "unknown";
  // When neither a code nor a message is present the envelope shape is
  // unrecognised (e.g. a backend contract change) — surface a body snippet so
  // the failure is diagnosable instead of an opaque "unknown - no message".
  const bodySnippet =
    errorCode === undefined && errorMsg === undefined
      ? `\nUnexpected response body (truncated): ${rawResponse.slice(0, 800)}`
      : "";
  throw new BailianError(
    `Security API failed: ${code} - ${errorMsg ?? "no message"}${bodySnippet}`,
    // 12000092 (no permission to create the service-linked role) is an auth
    // problem the caller can act on; everything else is a generic failure.
    code === "12000092" ? ExitCode.AUTH : ExitCode.GENERAL,
    SECURITY_ERROR_HINTS[code],
    { rawResponse: rawResponse.slice(0, 500) },
  );
}

/**
 * Parse an Agent Security Center response body and return the business payload.
 *
 * The backend serves these through the Zelda "DataV2" double-envelope — the same
 * shape the console gateway returns (see console/models.ts unwrapResponse):
 *
 *   { code, successResponse, requestId,
 *     data: { success, errorCode, errorMsg,
 *             DataV2: { ret: ["SUCCESS::…"],
 *                       data: { success, failed, data: <payload> } } } }
 *
 * The payload lives at `data.DataV2.data.data`. The legacy flat envelope
 * `{ success, data, errorCode, errorMsg }` is still accepted so any endpoint
 * that has not migrated keeps working. A failed or unrecognized shape throws
 * with the raw body attached (surfaced by --output json) for diagnosis.
 */
export function parseSecurityBody<T>(raw: string, contentType?: string | null): T | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new BailianError(
      `Security API returned non-JSON response (${contentType ?? "unknown type"}).`,
      ExitCode.GENERAL,
      undefined,
      { rawResponse: raw.slice(0, 500) },
    );
  }

  const root = asRecord(body);
  const data = root ? asRecord(root.data) : undefined;
  const dataV2 = data ? asRecord(data.DataV2) : undefined;

  // Zelda / DataV2 double-envelope (current backend contract).
  if (dataV2) {
    const inner = asRecord(dataV2.data);
    const ret = Array.isArray(dataV2.ret) ? dataV2.ret.map((entry) => String(entry)) : [];
    const retOk = ret.length === 0 || ret.some((line) => line.startsWith("SUCCESS"));
    const errorCode = firstNonEmptyString(data?.errorCode, root?.errorCode);
    const errorMsg =
      firstNonEmptyString(data?.errorMsg, root?.errorMsg) ?? (retOk ? undefined : ret.join("; "));
    const failed =
      root?.successResponse === false ||
      data?.success === false ||
      inner?.success === false ||
      inner?.failed === true ||
      !retOk ||
      errorCode !== undefined;
    if (failed) throwSecurityFailure(errorCode, errorMsg, raw);
    return ((inner ? inner.data : undefined) ?? null) as T | null;
  }

  // Legacy flat envelope: { success, data, errorCode, errorMsg }.
  if (root && "success" in root) {
    if (!root.success) {
      throwSecurityFailure(
        firstNonEmptyString(root.errorCode),
        firstNonEmptyString(root.errorMsg),
        raw,
      );
    }
    return (root.data ?? null) as T | null;
  }

  // Bare payload: the REST endpoint currently returns the business object
  // directly, with no envelope. Treat the root object as the payload.
  if (root) return root as T;

  // Not an object at all — surface the raw body so the contract change is visible.
  throwSecurityFailure(undefined, undefined, raw);
}

/**
 * GET a Security Center endpoint and unwrap its envelope.
 *
 * `url` is an absolute AgentStudio URL (see securityOverviewEndpoint /
 * securityAgentLogsEndpoint, or a --base-url override); the Client uses it
 * verbatim and injects the Bearer token. Genuine HTTP errors (non-2xx) surface
 * through the Client transport; only HTTP 200 bodies reach parseSecurityBody.
 * Returns null when the server reports success with no payload.
 */
export async function securityGet<T>(client: Client, url: string): Promise<T | null> {
  const response = await client.request({ path: url, method: "GET" });
  const raw = await response.text();
  return parseSecurityBody<T>(raw, response.headers.get("content-type"));
}
