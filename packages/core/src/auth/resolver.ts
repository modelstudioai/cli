import { REGIONS } from "../config/schema.ts";
import type { ResolutionSources } from "../config/loader.ts";
import type { ApiKeyCredential, ConsoleCredential, OpenApiCredential, AuthState } from "./types.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

// Resolve the credential for a command's declared domain (model = api-key,
// console = access-token), by priority, or throw. Read only from sources.

/** Model-domain baseUrl(flag > env > config file > fallback);无需 key 也可解析。 */
export function resolveModelBaseUrl(s: ResolutionSources, fallback: string = REGIONS.cn): string {
  return s.flags.baseUrl || s.env.DASHSCOPE_BASE_URL || s.file.base_url || fallback;
}

/**
 * Model-domain credential from sources. Priority: `--api-key` flag >
 * `DASHSCOPE_API_KEY` env > config.json `api_key`. baseUrl: flag > env > file > cn.
 */
export function resolveApiKey(s: ResolutionSources): ApiKeyCredential {
  const baseUrl = resolveModelBaseUrl(s);
  if (s.flags.apiKey) return { token: s.flags.apiKey, baseUrl, source: "flag" };
  const envKey = s.env.DASHSCOPE_API_KEY?.trim();
  if (envKey) return { token: envKey, baseUrl, source: "env" };
  if (s.file.api_key) return { token: s.file.api_key, baseUrl, source: "config" };
  throw new BailianError(
    "No API key found.",
    ExitCode.AUTH,
    "Set DASHSCOPE_API_KEY, pass --api-key, or run `bl auth login`.",
  );
}

/** Console-domain credential from sources — access token + 连接目标(flag > file > 默认)。 */
export function resolveConsole(s: ResolutionSources): ConsoleCredential {
  const token = s.file.access_token?.trim();
  if (!token) {
    throw new BailianError(
      "No console access token found.",
      ExitCode.AUTH,
      "Run `bl auth login --console`.",
    );
  }
  return {
    token,
    region: s.flags.consoleRegion || s.file.console_region || "cn-beijing",
    site: (s.flags.consoleSite as ConsoleCredential["site"]) || s.file.console_site || "domestic",
    switchAgent: s.flags.consoleSwitchAgent || s.file.console_switch_agent || undefined,
    source: "config",
  };
}

/** Alibaba Cloud OpenAPI AK/SK credential. Priority: flags > env > config. */
export function resolveOpenApi(s: ResolutionSources): OpenApiCredential {
  const flagCred = resolveOpenApiPair(
    "flag",
    s.flags.accessKeyId,
    s.flags.accessKeySecret,
    s.flags.accessKeyId !== undefined || s.flags.accessKeySecret !== undefined,
    s.flags.securityToken,
  );
  if (flagCred) return flagCred;

  const envCred = resolveOpenApiPair(
    "env",
    s.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    s.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    Boolean(
      trimNonEmpty(s.env.ALIBABA_CLOUD_ACCESS_KEY_ID) ||
      trimNonEmpty(s.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET),
    ),
    s.env.ALIBABA_CLOUD_SECURITY_TOKEN,
  );
  if (envCred) return envCred;

  const configCred = resolveOpenApiPair(
    "config",
    s.file.access_key_id,
    s.file.access_key_secret,
    Boolean(s.file.access_key_id || s.file.access_key_secret),
    s.file.security_token,
  );
  if (configCred) return configCred;

  throw new BailianError(
    "No OpenAPI AK/SK credentials found.",
    ExitCode.AUTH,
    "Set ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET, pass --access-key-id and --access-key-secret, or run `bl auth login --open-api`.",
  );
}

function resolveOpenApiPair(
  source: OpenApiCredential["source"],
  rawAccessKeyId: string | undefined,
  rawAccessKeySecret: string | undefined,
  provided: boolean,
  rawSecurityToken?: string,
): OpenApiCredential | undefined {
  if (!provided) return undefined;

  const accessKeyId = trimNonEmpty(rawAccessKeyId);
  const accessKeySecret = trimNonEmpty(rawAccessKeySecret);

  if (!accessKeyId || !accessKeySecret) {
    throw new BailianError(
      "Incomplete OpenAPI AK/SK credentials found.",
      ExitCode.AUTH,
      openApiPairHint(source),
    );
  }

  const securityToken = trimNonEmpty(rawSecurityToken);
  return { accessKeyId, accessKeySecret, securityToken, source };
}

function trimNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function openApiPairHint(source: OpenApiCredential["source"]): string {
  if (source === "flag") {
    return "Pass both --access-key-id and --access-key-secret, or remove the partial flags to use env/config credentials.";
  }
  if (source === "env") {
    return "Set both ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET, or unset the partial env vars to use config credentials.";
  }
  return "Run `bl auth login --open-api --access-key-id <id> --access-key-secret <secret>` again to save a complete pair.";
}

/** Full auth snapshot from sources — what would resolve per domain (or undefined). */
export function describeAuthState(s: ResolutionSources): AuthState {
  const state: AuthState = {};
  try {
    state.apiKey = resolveApiKey(s);
  } catch {
    /* no model credential */
  }
  try {
    state.console = resolveConsole(s);
  } catch {
    /* no console credential */
  }
  try {
    state.openapi = resolveOpenApi(s);
  } catch {
    /* no OpenAPI credential */
  }
  return state;
}
