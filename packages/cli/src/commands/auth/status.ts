import {
  defineCommand,
  resolveCredential,
  resolveConsoleGatewayCredential,
  detectOutputFormat,
  maskToken,
  type Config,
  type GlobalFlags,
  type ResolvedCredential,
} from "bailian-cli-core";
import { emitResult, emitBare } from "../../output/output.ts";
import { API_KEY_PAGE } from "../../urls.ts";

interface StoredCredential {
  configured: boolean;
  source?: string;
  masked?: string;
}

interface AuthStatusPayload {
  active_mode: string;
  api_key: StoredCredential;
  access_token: StoredCredential;
  coding_plan_api_key?: StoredCredential;
  token_plan_api_key?: StoredCredential;
  dashscope_commands?: {
    method: string;
    mode: string;
    source: string;
    masked: string;
    base_url: string;
    api_style: string;
  };
  console_gateway_commands?: { method: string; source: string; masked: string };
}

function storedApiKey(config: Config): StoredCredential {
  if (config.apiKey) {
    return { configured: true, source: "flag", masked: maskToken(config.apiKey) };
  }
  if (config.fileApiKey) {
    return { configured: true, source: "config.json", masked: maskToken(config.fileApiKey) };
  }
  const env = process.env.DASHSCOPE_API_KEY?.trim();
  if (env) {
    return { configured: true, source: "DASHSCOPE_API_KEY", masked: maskToken(env) };
  }
  return { configured: false };
}

function storedAccessToken(config: Config): StoredCredential {
  if (config.accessTokenEnv) {
    return {
      configured: true,
      source: "DASHSCOPE_ACCESS_TOKEN",
      masked: maskToken(config.accessTokenEnv),
    };
  }
  if (config.fileAccessToken) {
    return {
      configured: true,
      source: "config.json",
      masked: maskToken(config.fileAccessToken),
    };
  }
  return { configured: false };
}

function storedPlanKey(key: string | undefined, envVar: string): StoredCredential {
  const env = process.env[envVar]?.trim();
  if (key) return { configured: true, source: "config.json", masked: maskToken(key) };
  if (env) return { configured: true, source: envVar, masked: maskToken(env) };
  return { configured: false };
}

async function tryResolveDashscope(config: Config): Promise<ResolvedCredential | undefined> {
  try {
    return await resolveCredential(config);
  } catch {
    return undefined;
  }
}

async function tryResolveConsole(config: Config): Promise<ResolvedCredential | undefined> {
  try {
    return await resolveConsoleGatewayCredential(config);
  } catch {
    return undefined;
  }
}

async function buildStatus(config: Config): Promise<AuthStatusPayload> {
  const status: AuthStatusPayload = {
    active_mode: config.activeAuthMode,
    api_key: storedApiKey(config),
    access_token: storedAccessToken(config),
  };

  const codingPlan = storedPlanKey(config.codingPlanApiKey, "BAILIAN_CODING_PLAN_API_KEY");
  if (codingPlan.configured) status.coding_plan_api_key = codingPlan;
  const tokenPlan = storedPlanKey(config.tokenPlanApiKey, "BAILIAN_TOKEN_PLAN_API_KEY");
  if (tokenPlan.configured) status.token_plan_api_key = tokenPlan;

  const dashscope = await tryResolveDashscope(config);
  if (dashscope) {
    status.dashscope_commands = {
      method: dashscope.method,
      mode: dashscope.mode,
      source: dashscope.source,
      masked: maskToken(dashscope.token),
      base_url: dashscope.baseUrl,
      api_style: dashscope.apiStyle,
    };
  }

  const consoleGw = await tryResolveConsole(config);
  if (consoleGw) {
    status.console_gateway_commands = {
      method: consoleGw.method,
      source: consoleGw.source,
      masked: maskToken(consoleGw.token),
    };
  }

  return status;
}

function hasAnyAuth(status: AuthStatusPayload): boolean {
  return (
    status.api_key.configured ||
    status.access_token.configured ||
    !!status.coding_plan_api_key?.configured ||
    !!status.token_plan_api_key?.configured ||
    !!status.dashscope_commands ||
    !!status.console_gateway_commands
  );
}

function emitTextStatus(status: AuthStatusPayload): void {
  emitBare("Authentication Status:");
  emitBare(`  Active Mode:   ${status.active_mode}`);
  emitBare("  Stored credentials:");
  if (status.api_key.configured) {
    emitBare(`    API key:             ${status.api_key.source}  ${status.api_key.masked}`);
  } else {
    emitBare("    API key:             not configured");
  }
  if (status.access_token.configured) {
    emitBare(
      `    Console token:       ${status.access_token.source}  ${status.access_token.masked}`,
    );
  }
  if (status.coding_plan_api_key?.configured) {
    emitBare(
      `    Coding Plan key:     ${status.coding_plan_api_key.source}  ${status.coding_plan_api_key.masked}`,
    );
  }
  if (status.token_plan_api_key?.configured) {
    emitBare(
      `    Token Plan key:      ${status.token_plan_api_key.source}  ${status.token_plan_api_key.masked}`,
    );
  }
  emitBare("  Effective credential:");
  if (status.dashscope_commands) {
    emitBare(
      `    DashScope API:       ${status.dashscope_commands.mode} (${status.dashscope_commands.source})  ${status.dashscope_commands.masked}`,
    );
    emitBare(`    Base URL:            ${status.dashscope_commands.base_url}`);
    emitBare(`    API Style:           ${status.dashscope_commands.api_style}`);
  } else {
    emitBare("    DashScope API:       unavailable");
  }
  if (status.console_gateway_commands) {
    emitBare(
      `    Console gateway:     ${status.console_gateway_commands.method} (${status.console_gateway_commands.source})  ${status.console_gateway_commands.masked}`,
    );
  } else {
    emitBare("    Console gateway:     unavailable (run bl auth login --console)");
  }
}

export default defineCommand({
  name: "auth status",
  description: "Show current authentication state",
  usage: "bl auth status",
  examples: ["bl auth status", "bl auth status --output json"],
  async run(config: Config, _flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const status = await buildStatus(config);

    if (!hasAnyAuth(status)) {
      const result = {
        authenticated: false,
        message: "Not authenticated.",
        hint: [
          `DashScope API: bl auth login --mode ${config.activeAuthMode} --api-key <key> or DASHSCOPE_API_KEY`,
          "Console gateway: bl auth login --console or DASHSCOPE_ACCESS_TOKEN",
          `Get API Key: ${API_KEY_PAGE}`,
        ].join("\n"),
        ...status,
      };
      emitResult(result, format);
      return;
    }

    if (format !== "text") {
      emitResult({ authenticated: true, ...status }, format);
      return;
    }

    emitTextStatus(status);
  },
});
