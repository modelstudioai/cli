import type { Config } from "../config/schema.ts";
import type { ResolvedCredential } from "./types.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export async function resolveCredential(config: Config): Promise<ResolvedCredential> {
  // 1. --api-key flag (explicit API key for this invocation)
  if (config.apiKey) {
    return { token: config.apiKey, method: "api-key", source: "flag" };
  }

  // 2. API key in config (DashScope sk-…); preferred over console token when both exist
  if (config.fileApiKey) {
    return { token: config.fileApiKey, method: "api-key", source: "config.json" };
  }

  // 3. access_token from env (temporary override)
  if (config.accessTokenEnv) {
    return {
      token: config.accessTokenEnv,
      method: "access-token",
      source: "DASHSCOPE_ACCESS_TOKEN",
    };
  }

  // 4. access_token from config (console callback)
  if (config.fileAccessToken) {
    return {
      token: config.fileAccessToken,
      method: "access-token",
      source: "config.json",
    };
  }

  // 5. API key from environment
  if (process.env.DASHSCOPE_API_KEY) {
    return { token: process.env.DASHSCOPE_API_KEY, method: "api-key", source: "DASHSCOPE_API_KEY" };
  }

  throw new BailianError(
    "No credentials found.",
    ExitCode.AUTH,
    "Set DASHSCOPE_API_KEY environment variable, pass --api-key, or configure a key.",
  );
}

/**
 * Credential for Bailian **console** CLI gateway only (`callConsoleGateway`).
 * DashScope API keys are not valid Bearer tokens for this gateway — use env/file
 * `access_token` even when `api_key` is also present in config.
 */
/** Thrown when `callConsoleGateway` has no usable console session token. */
export const CONSOLE_GATEWAY_NO_TOKEN_MESSAGE = "No console access token found.";

export async function resolveConsoleGatewayCredential(config: Config): Promise<ResolvedCredential> {
  if (config.accessTokenEnv) {
    return {
      token: config.accessTokenEnv,
      method: "access-token",
      source: "DASHSCOPE_ACCESS_TOKEN",
    };
  }

  if (config.fileAccessToken) {
    return {
      token: config.fileAccessToken,
      method: "access-token",
      source: "config.json",
    };
  }

  throw new BailianError(
    CONSOLE_GATEWAY_NO_TOKEN_MESSAGE,
    ExitCode.AUTH,
    "Run `bl auth login --console` or set DASHSCOPE_ACCESS_TOKEN.",
  );
}
