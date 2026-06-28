import type { Config } from "../config/schema.ts";
import type { ApiKeyCredential, ConsoleCredential, AuthState } from "./types.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

// Resolve the credential for a command's declared domain (model = api-key,
// console = access-token), by priority, or throw. Read only from `config`.

/**
 * Model-domain credential — always an API key. Priority: `--api-key` flag >
 * `DASHSCOPE_API_KEY` env > config.json `api_key`. No access tokens here.
 */
export async function resolveApiKeyCredential(config: Config): Promise<ApiKeyCredential> {
  const baseUrl = config.baseUrl;
  if (config.apiKey) return { token: config.apiKey, baseUrl, source: "flag" };
  if (config.apiKeyEnv) return { token: config.apiKeyEnv, baseUrl, source: "env" };
  if (config.fileApiKey) return { token: config.fileApiKey, baseUrl, source: "config" };
  throw new BailianError(
    "No API key found.",
    ExitCode.AUTH,
    "Set DASHSCOPE_API_KEY, pass --api-key, or run `bl auth login`.",
  );
}

/** Console-domain credential — an access token from `bl auth login --console`. */
export async function resolveConsoleCredential(config: Config): Promise<ConsoleCredential> {
  if (config.fileAccessToken) {
    return {
      token: config.fileAccessToken,
      region: config.consoleRegion ?? "cn-beijing",
      site: config.consoleSite ?? "domestic",
      switchAgent: config.consoleSwitchAgent,
      source: "config",
    };
  }
  throw new BailianError(
    "No console access token found.",
    ExitCode.AUTH,
    "Run `bl auth login --console`.",
  );
}

/** Full auth snapshot for `bl auth status` — what would resolve per domain (or undefined). */
export async function describeAuth(config: Config): Promise<AuthState> {
  const state: AuthState = {};
  try {
    state.apiKey = await resolveApiKeyCredential(config);
  } catch {
    /* no model credential */
  }
  try {
    state.console = await resolveConsoleCredential(config);
  } catch {
    /* no console credential */
  }
  return state;
}
