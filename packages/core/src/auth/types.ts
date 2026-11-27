import type { AliyunOAuthProfile } from "./aliyun-types.ts";

/** Where a resolved credential came from (shown by `bl auth status`). */
export type CredentialSource = "flag" | "env" | "config";

/**
 * Winning sources for the model-domain connection pair.
 * Missing `baseUrlSource` means the built-in REGIONS.cn default.
 */
export interface ModelConnectionProvenance {
  apiKeySource?: CredentialSource;
  baseUrlSource?: CredentialSource;
}

/** Credential for the **model domain** (DashScope data plane). Always an API key. */
export interface ApiKeyCredential {
  token: string;
  /** Base URL to send this key's requests to. */
  baseUrl: string;
  source: CredentialSource;
}

/** Credential for the **console domain** (Bailian console gateway). An access token + region/site. */
export interface ConsoleCredential {
  token: string;
  gateway?: string;
  expiresAt?: number;
  method?: "aliyun-oauth";
  sessionRef?: string;
  configurationFingerprint?: string;
  region: string;
  site: "domestic" | "international";
  switchAgent?: number;
  source: CredentialSource;
}

/** Credential for Alibaba Cloud OpenAPI calls signed with AK/SK. */
export interface OpenApiCredential {
  method?: "aliyun-oauth";
  sessionRef?: string;
  configurationFingerprint?: string;
  expiresAt?: number;
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
  source: CredentialSource;
}

/** Full auth snapshot for display (`bl auth status`) — what would resolve per domain. */
export interface AuthState {
  aliyunOAuth?: AliyunOAuthProfile;
  apiKey?: ApiKeyCredential;
  console?: ConsoleCredential;
  openapi?: OpenApiCredential;
}
