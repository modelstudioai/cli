import { UsageError } from "../errors/base.ts";
import type { AliyunOAuthProfile } from "./aliyun-types.ts";

export const ALIYUN_CLI_CLIENT_ID = "4001958595402383681";
export const ALIYUN_CLI_SCOPE = "openid /internal/bailian/cli";
export const ALIYUN_OAUTH_BASE_URL = "https://oauth.aliyun.com";

export function normalizeOAuthUrl(value: string, originOnly = false): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError("Invalid OAuth endpoint. / OAuth 端点无效。");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((name) =>
      [
        "access_token",
        "refresh_token",
        "client_secret",
        "code",
        "code_verifier",
        "sec_token",
        "token",
        "authorization",
      ].includes(name.toLowerCase()),
    ) ||
    (originOnly && (url.search || (url.pathname !== "/" && url.pathname !== "")))
  ) {
    throw new UsageError(
      "OAuth endpoints must use HTTPS without credentials or fragments; HTTP is allowed only on loopback. / OAuth 端点必须使用 HTTPS，不能包含凭据或片段；HTTP 仅允许回环地址。",
    );
  }
  return originOnly ? url.origin : url.toString();
}

export function normalizeOpenApiHost(value: string): string {
  const host = value.trim();
  const url = normalizeOAuthUrl(`https://${host}`, true);
  if (/[\\/?#@\s]/u.test(host)) {
    throw new UsageError(
      "OpenAPI endpoint must be a hostname with an optional port. / OpenAPI 端点必须是主机名，可包含端口。",
    );
  }
  return new URL(url).host;
}

export function parseAliyunOAuthProfile(raw: unknown): AliyunOAuthProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new UsageError("Invalid aliyun_oauth configuration. / aliyun_oauth 配置无效。");
  }
  const profile = raw as Record<string, unknown>;
  const requiredStrings = [
    "client_id",
    "scope",
    "authorization_url",
    "oauth_base_url",
    "modelstudio_host",
    "console_gateway",
    "console_region",
    "session_ref",
  ] as const;
  for (const field of requiredStrings) {
    if (typeof profile[field] !== "string" || !profile[field].trim()) {
      throw new UsageError(`Invalid aliyun_oauth.${field}. / aliyun_oauth.${field} 无效。`);
    }
  }
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(
      profile.session_ref as string,
    ) ||
    typeof profile.console_enabled !== "boolean" ||
    typeof profile.openapi_enabled !== "boolean"
  ) {
    throw new UsageError(
      "Invalid OAuth session reference or activation state. / OAuth 会话引用或激活状态无效。",
    );
  }
  const result: AliyunOAuthProfile = {
    client_id: (profile.client_id as string).trim(),
    scope: (profile.scope as string).trim(),
    authorization_url: normalizeOAuthUrl(profile.authorization_url as string),
    oauth_base_url: normalizeOAuthUrl(profile.oauth_base_url as string, true),
    modelstudio_host: normalizeOpenApiHost(profile.modelstudio_host as string),
    console_gateway: normalizeOAuthUrl(profile.console_gateway as string, true),
    console_region: (profile.console_region as string).trim(),
    session_ref: profile.session_ref as string,
    console_enabled: profile.console_enabled,
    openapi_enabled: profile.openapi_enabled,
  };
  if (profile.bailiancontrol_host !== undefined) {
    if (typeof profile.bailiancontrol_host !== "string")
      throw new UsageError("Invalid bailiancontrol_host. / bailiancontrol_host 无效。");
    result.bailiancontrol_host = normalizeOpenApiHost(profile.bailiancontrol_host);
  }
  for (const field of ["access_token_expires_at", "sts_expires_at"] as const) {
    const value = profile[field];
    if (value !== undefined) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
        throw new UsageError(`Invalid aliyun_oauth.${field}. / aliyun_oauth.${field} 无效。`);
      result[field] = value;
    }
  }
  return result;
}
