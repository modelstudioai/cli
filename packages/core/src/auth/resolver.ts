import type { Config } from "../config/schema.ts";
import type { ResolvedCredential } from "./types.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export const CODING_PLAN_BASE_URLS = {
  cn: "https://coding.dashscope.aliyuncs.com/v1",
  intl: "https://coding-intl.dashscope.aliyuncs.com/v1",
} as const;

export const TOKEN_PLAN_NATIVE_BASE_URLS = {
  cn: "https://token-plan.cn-beijing.maas.aliyuncs.com",
  intl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com",
} as const;

export const TOKEN_PLAN_BASE_URLS = {
  cn: `${TOKEN_PLAN_NATIVE_BASE_URLS.cn}/compatible-mode/v1`,
  intl: `${TOKEN_PLAN_NATIVE_BASE_URLS.intl}/compatible-mode/v1`,
} as const;

export async function resolveCredential(config: Config): Promise<ResolvedCredential> {
  // 1. --api-key flag is a process-local Standard API Key override.
  if (config.apiKey) {
    return {
      token: config.apiKey,
      method: "api-key",
      mode: "standard-api-key",
      source: "flag",
      baseUrl: config.baseUrl,
      apiStyle: "dashscope-native",
    };
  }

  // 2. Active auth mode from config/env. No implicit fallback to other stored keys.
  if (config.activeAuthMode === "coding-plan") {
    if (config.codingPlanApiKey) {
      return {
        token: config.codingPlanApiKey,
        method: "api-key",
        mode: "coding-plan",
        source: "coding_plan_api_key",
        baseUrl: CODING_PLAN_BASE_URLS[config.codingPlanRegion],
        apiStyle: "openai-compatible",
      };
    }
    throw new BailianError(
      "No Coding Plan credentials found.",
      ExitCode.AUTH,
      "Set BAILIAN_CODING_PLAN_API_KEY environment variable, or configure a Coding Plan API key.",
    );
  }

  if (config.activeAuthMode === "token-plan") {
    if (config.tokenPlanApiKey) {
      return {
        token: config.tokenPlanApiKey,
        method: "api-key",
        mode: "token-plan",
        source: "token_plan_api_key",
        baseUrl: TOKEN_PLAN_NATIVE_BASE_URLS[config.tokenPlanRegion],
        apiStyle: "openai-compatible",
      };
    }
    throw new BailianError(
      "No Token Plan credentials found.",
      ExitCode.AUTH,
      "Set BAILIAN_TOKEN_PLAN_API_KEY environment variable, or configure a Token Plan API key.",
    );
  }

  // 3. Standard API Key from config file.
  if (config.fileApiKey) {
    return {
      token: config.fileApiKey,
      method: "api-key",
      mode: "standard-api-key",
      source: "config.json",
      baseUrl: config.baseUrl,
      apiStyle: "dashscope-native",
    };
  }

  // 4. access_token from env (temporary override, console login)
  if (config.accessTokenEnv) {
    return {
      token: config.accessTokenEnv,
      method: "access-token",
      mode: "standard-api-key",
      source: "DASHSCOPE_ACCESS_TOKEN",
      baseUrl: config.baseUrl,
      apiStyle: "dashscope-native",
    };
  }

  // 5. access_token from config (console callback)
  if (config.fileAccessToken) {
    return {
      token: config.fileAccessToken,
      method: "access-token",
      mode: "standard-api-key",
      source: "config.json",
      baseUrl: config.baseUrl,
      apiStyle: "dashscope-native",
    };
  }

  // 6. Standard API Key from environment.
  if (process.env.DASHSCOPE_API_KEY) {
    return {
      token: process.env.DASHSCOPE_API_KEY,
      method: "api-key",
      mode: "standard-api-key",
      source: "DASHSCOPE_API_KEY",
      baseUrl: config.baseUrl,
      apiStyle: "dashscope-native",
    };
  }

  throw new BailianError(
    "No credentials found.",
    ExitCode.AUTH,
    "Set DASHSCOPE_API_KEY environment variable, pass --api-key, or configure a key.",
  );
}

export function requireNativeDashScope(
  credential: ResolvedCredential,
  feature = "This command",
): void {
  if (credential.apiStyle === "dashscope-native") return;
  const modeLabel = credential.mode === "coding-plan" ? "Coding Plan" : "Token Plan";
  throw new BailianError(
    `${feature} is not supported in ${modeLabel} mode.`,
    ExitCode.AUTH,
    "Switch to standard-api-key mode: bl auth use --mode standard-api-key",
  );
}

/** Thrown when `callConsoleGateway` has no usable console session token. */
export const CONSOLE_GATEWAY_NO_TOKEN_MESSAGE = "No console access token found.";

export async function resolveConsoleGatewayCredential(config: Config): Promise<ResolvedCredential> {
  if (config.accessTokenEnv) {
    return {
      token: config.accessTokenEnv,
      method: "access-token",
      mode: "standard-api-key",
      source: "DASHSCOPE_ACCESS_TOKEN",
      baseUrl: config.baseUrl,
      apiStyle: "dashscope-native",
    };
  }

  if (config.fileAccessToken) {
    return {
      token: config.fileAccessToken,
      method: "access-token",
      mode: "standard-api-key",
      source: "config.json",
      baseUrl: config.baseUrl,
      apiStyle: "dashscope-native",
    };
  }

  throw new BailianError(
    CONSOLE_GATEWAY_NO_TOKEN_MESSAGE,
    ExitCode.AUTH,
    "Run `bl auth login --console` or set DASHSCOPE_ACCESS_TOKEN.",
  );
}
