import { REGIONS } from "../config/schema.ts";
import type { ResolutionSources } from "../config/loader.ts";
import type { ApiKeyCredential, ConsoleCredential, AuthState } from "./types.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

// Resolve the credential for a command's declared domain (model = api-key,
// console = access-token), by priority, or throw. Read only from sources.

/** Model-domain baseUrl(flag > env > file > cn)——无需 key 也可解析;login 验证等用。 */
export function resolveModelBaseUrl(s: ResolutionSources): string {
  return s.flags.baseUrl || s.env.DASHSCOPE_BASE_URL || s.file.base_url || REGIONS.cn;
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
  return state;
}
