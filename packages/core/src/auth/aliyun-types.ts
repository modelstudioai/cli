import type { ConsoleCredential, OpenApiCredential } from "./types.ts";

export interface AliyunOAuthProfile {
  client_id: string;
  scope: string;
  authorization_url: string;
  oauth_base_url: string;
  modelstudio_host: string;
  bailiancontrol_host?: string;
  console_gateway: string;
  console_region: string;
  session_ref: string;
  console_enabled: boolean;
  openapi_enabled: boolean;
  access_token_expires_at?: number;
  sts_expires_at?: number;
}

export interface AliyunOAuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
}

export interface AliyunOAuthSession extends AliyunOAuthTokens {
  configurationFingerprint?: string;
  refreshPending?: boolean;
  sts?: {
    accessKeyId: string;
    accessKeySecret: string;
    securityToken: string;
    expiresAt: number;
  };
  consoleTokens?: Record<string, { token: string; expiresAt?: number }>;
}

export interface OpenApiCredentialProvider {
  getCredential(purpose?: "openapi" | "console"): Promise<OpenApiCredential>;
  assertAvailable(purpose?: "openapi" | "console"): void;
  resolveHost(
    host: string,
    credential?: OpenApiCredential,
    purpose?: "openapi" | "console",
  ): string;
  resolveConsoleTarget(
    target: Omit<ConsoleCredential, "token" | "source">,
    purpose?: "openapi" | "console",
  ): Omit<ConsoleCredential, "token" | "source">;
  getConsoleCredential(
    target: Omit<ConsoleCredential, "token" | "source">,
  ): Promise<ConsoleCredential | undefined>;
  saveConsoleCredential(credential: ConsoleCredential): Promise<void>;
}
