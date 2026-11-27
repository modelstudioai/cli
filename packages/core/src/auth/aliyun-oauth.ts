import { randomBytes, createHash } from "node:crypto";
import { httpTransport } from "../client/transport.ts";
import { debugRequest, debugResponse } from "../client/diagnostics.ts";
import type { HttpDeps } from "../client/http.ts";
import { trackingHeaders } from "../client/headers.ts";
import { BailianError, UsageError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { AliyunOAuthProfile, AliyunOAuthTokens, AliyunOAuthSession } from "./aliyun-types.ts";

export interface AliyunOAuthDeps extends Pick<HttpDeps, "identity" | "debug"> {
  timeout: number;
  /** Optional cancellation for token and STS exchanges. */
  signal?: AbortSignal;
  now?: () => number;
  warning?: HttpDeps["debug"];
  recoveryHint?: string;
}

export function createOAuthProofKey(): { state: string; verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(32).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier, "ascii").digest("base64url"),
  };
}

export function aliyunAuthorizationUrl(
  profile: Pick<AliyunOAuthProfile, "authorization_url" | "client_id" | "scope">,
  redirectUri: string,
  proof: ReturnType<typeof createOAuthProofKey>,
): string {
  const url = new URL(profile.authorization_url);
  for (const [name, value] of Object.entries({
    response_type: "code",
    client_id: profile.client_id,
    scope: profile.scope,
    redirect_uri: redirectUri,
    state: proof.state,
    code_challenge: proof.challenge,
    code_challenge_method: "S256",
  }))
    url.searchParams.set(name, value);
  return url.toString();
}

export function parseAliyunCallback(url: URL, state: string): string {
  if (url.searchParams.getAll("state").length !== 1 || url.searchParams.get("state") !== state) {
    throw new UsageError("Invalid OAuth state. / OAuth state 无效。");
  }
  if (url.searchParams.has("error")) {
    throw new BailianError(
      "OAuth authorization was denied or failed. / OAuth 授权被拒绝或失败。",
      ExitCode.GENERAL,
    );
  }
  const codes = url.searchParams.getAll("code");
  if (codes.length !== 1 || !codes[0]?.trim())
    throw new UsageError("Missing or duplicate OAuth code. / OAuth code 缺失或重复。");
  return codes[0];
}

async function postOAuth(
  profile: Pick<AliyunOAuthProfile, "oauth_base_url">,
  path: string,
  deps: AliyunOAuthDeps,
  headers: Record<string, string>,
  body?: string,
  secrets: string[] = [],
): Promise<Record<string, unknown>> {
  const endpoint = `${profile.oauth_base_url}${path}`;
  debugRequest(deps, "POST", endpoint);
  const timeout = AbortSignal.timeout(deps.timeout * 1000);
  const response = await httpTransport.fetch(endpoint, {
    method: "POST",
    headers: { ...trackingHeaders(deps.identity), ...headers },
    body,
    redirect: "error",
    signal: deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout,
  });
  debugResponse(deps, response);
  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BailianError(
      `OAuth response is not JSON (HTTP ${response.status}). / OAuth 响应不是 JSON（HTTP ${response.status}）。`,
      ExitCode.GENERAL,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new BailianError("Invalid OAuth response. / OAuth 响应无效。", ExitCode.GENERAL);
  const data = parsed as Record<string, unknown>;
  if (!response.ok || data.error || data.Success === false) {
    const errorMessage =
      data.error_description ?? data.Message ?? data.message ?? data.error ?? response.statusText;
    let message = typeof errorMessage === "string" ? errorMessage : JSON.stringify(errorMessage)!;
    for (const secret of secrets.flatMap((value) => [
      value,
      encodeURIComponent(value),
      new URLSearchParams({ value }).toString().slice(6),
    ]))
      if (secret) message = message.replaceAll(secret, "[REDACTED]");
    const apiCode = data.error ?? data.Code;
    const requestId = data.requestId ?? data.RequestId ?? response.headers.get("x-request-id");
    throw new BailianError(message, ExitCode.GENERAL, undefined, {
      api: {
        httpStatus: response.status,
        apiCode: typeof apiCode === "string" ? apiCode : undefined,
        requestId: typeof requestId === "string" ? requestId : undefined,
      },
    });
  }
  return data;
}

function tokenResult(
  data: Record<string, unknown>,
  refreshToken: string | undefined,
  deps: AliyunOAuthDeps,
): AliyunOAuthTokens {
  const accessToken = data.access_token;
  const returnedRefreshToken = data.refresh_token;
  const rawExpiresIn = data.expires_in;
  const expiresIn =
    typeof rawExpiresIn === "number" ||
    (typeof rawExpiresIn === "string" && /^\d+(?:\.\d+)?$/u.test(rawExpiresIn.trim()))
      ? Number(rawExpiresIn)
      : NaN;
  const accessTokenExpiresAt = (deps.now?.() ?? Date.now()) + expiresIn * 1000;
  if (
    typeof accessToken !== "string" ||
    !accessToken.trim() ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0 ||
    !Number.isSafeInteger(accessTokenExpiresAt) ||
    !Number.isFinite(new Date(accessTokenExpiresAt).getTime()) ||
    (returnedRefreshToken !== undefined &&
      (typeof returnedRefreshToken !== "string" || !returnedRefreshToken.trim())) ||
    (data.token_type !== undefined && data.token_type !== "Bearer")
  )
    throw new BailianError(
      "OAuth response is missing valid token fields. / OAuth 响应缺少有效令牌字段。",
      ExitCode.GENERAL,
    );
  const effectiveRefreshToken =
    typeof returnedRefreshToken === "string" ? returnedRefreshToken : refreshToken;
  if (!effectiveRefreshToken)
    throw new BailianError(
      "Native OAuth login did not return a refresh token. / Native OAuth 登录未返回刷新令牌。",
      ExitCode.GENERAL,
    );
  return {
    accessToken,
    refreshToken: effectiveRefreshToken,
    accessTokenExpiresAt,
  };
}

export async function exchangeAliyunCode(
  profile: Pick<AliyunOAuthProfile, "oauth_base_url" | "client_id" | "scope">,
  code: string,
  verifier: string,
  redirectUri: string,
  deps: AliyunOAuthDeps,
): Promise<AliyunOAuthTokens> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: profile.client_id,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const data = await postOAuth(
    profile,
    "/v1/token",
    deps,
    { "Content-Type": "application/x-www-form-urlencoded" },
    form.toString(),
    [code, verifier],
  );
  if (typeof data.scope === "string") {
    const granted = new Set(data.scope.split(/\s+/u));
    if (profile.scope.split(/\s+/u).some((scope) => !granted.has(scope)))
      throw new BailianError(
        "OAuth granted scope does not cover the requested scope. / OAuth 授予范围未覆盖请求范围。",
        ExitCode.GENERAL,
      );
  }
  return tokenResult(data, undefined, deps);
}

export async function refreshAliyunTokens(
  profile: Pick<AliyunOAuthProfile, "oauth_base_url" | "client_id">,
  refreshToken: string,
  deps: AliyunOAuthDeps,
): Promise<AliyunOAuthTokens> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: profile.client_id,
    refresh_token: refreshToken,
  });
  return tokenResult(
    await postOAuth(
      profile,
      "/v1/token",
      deps,
      { "Content-Type": "application/x-www-form-urlencoded" },
      form.toString(),
      [refreshToken],
    ),
    refreshToken,
    deps,
  );
}

export async function exchangeAliyunSts(
  profile: Pick<AliyunOAuthProfile, "oauth_base_url">,
  accessToken: string,
  deps: AliyunOAuthDeps,
): Promise<NonNullable<AliyunOAuthSession["sts"]>> {
  const data = await postOAuth(
    profile,
    "/v1/exchange",
    deps,
    { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    undefined,
    [accessToken],
  );
  const hasPascalCaseFields = [
    "AccessKeyId",
    "AccessKeySecret",
    "SecurityToken",
    "Expiration",
  ].some((field) => Object.hasOwn(data, field));
  const { accessKeyId, accessKeySecret, securityToken, expiration } = hasPascalCaseFields
    ? {
        accessKeyId: data.AccessKeyId,
        accessKeySecret: data.AccessKeySecret,
        securityToken: data.SecurityToken,
        expiration: data.Expiration,
      }
    : data;
  const expiresAt = typeof expiration === "string" ? Date.parse(expiration) : NaN;
  if (
    typeof accessKeyId !== "string" ||
    !accessKeyId.trim() ||
    typeof accessKeySecret !== "string" ||
    !accessKeySecret.trim() ||
    typeof securityToken !== "string" ||
    !securityToken.trim() ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= (deps.now?.() ?? Date.now())
  )
    throw new BailianError(
      "OAuth exchange did not return valid STS credentials. / OAuth 置换未返回有效 STS 凭据。",
      ExitCode.GENERAL,
    );
  return { accessKeyId, accessKeySecret, securityToken, expiresAt };
}

export async function revokeAliyunTokens(
  profile: Pick<AliyunOAuthProfile, "oauth_base_url" | "client_id">,
  refreshToken: string,
  deps: AliyunOAuthDeps,
): Promise<void> {
  const endpoint = `${profile.oauth_base_url}/v1/revoke`;
  const form = new URLSearchParams({ client_id: profile.client_id, token: refreshToken });
  debugRequest(deps, "POST", endpoint);
  const response = await httpTransport.fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...trackingHeaders(deps.identity),
    },
    body: form.toString(),
    redirect: "error",
    signal: AbortSignal.timeout(deps.timeout * 1000),
  });
  debugResponse(deps, response);
  if (!response.ok) {
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        data = parsed as Record<string, unknown>;
    } catch {
      /* Non-JSON service errors still retain their HTTP status. */
    }
    const description =
      data.error_description ?? data.Message ?? data.message ?? data.error ?? response.statusText;
    const message = typeof description === "string" ? description : JSON.stringify(description)!;
    const apiCode = data.error ?? data.Code;
    const requestId = data.requestId ?? data.RequestId ?? response.headers.get("x-request-id");
    throw new BailianError(
      message.replaceAll(refreshToken, "[REDACTED]") || `HTTP ${response.status}`,
      ExitCode.GENERAL,
      undefined,
      {
        api: {
          httpStatus: response.status,
          apiCode: typeof apiCode === "string" ? apiCode : undefined,
          requestId: typeof requestId === "string" ? requestId : undefined,
        },
      },
    );
  }
  await response.body?.cancel();
}
