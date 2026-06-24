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
import { emitResult, emitBare } from "bailian-cli-runtime";
import { API_KEY_PAGE } from "bailian-cli-runtime";

interface StoredCredential {
  configured: boolean;
  source?: string;
  masked?: string;
}

interface AuthStatusPayload {
  api_key: StoredCredential;
  access_token: StoredCredential;
  dashscope_commands?: { method: string; source: string; masked: string };
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
    api_key: storedApiKey(config),
    access_token: storedAccessToken(config),
  };

  const dashscope = await tryResolveDashscope(config);
  if (dashscope) {
    status.dashscope_commands = {
      method: dashscope.method,
      source: dashscope.source,
      masked: maskToken(dashscope.token),
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
    !!status.dashscope_commands ||
    !!status.console_gateway_commands
  );
}

function emitTextStatus(status: AuthStatusPayload, config: Config): void {
  emitBare("Authentication Status:");
  emitBare("  Stored credentials (can coexist):");
  if (status.api_key.configured) {
    emitBare(`    API key:         ${status.api_key.source}  ${status.api_key.masked}`);
  } else {
    emitBare("    API key:         not configured");
  }
  if (status.access_token.configured) {
    emitBare(`    Console token:   ${status.access_token.source}  ${status.access_token.masked}`);
  } else {
    emitBare("    Console token:   not configured");
  }
  emitBare("  Effective credential per command family:");
  if (status.dashscope_commands) {
    emitBare(
      `    DashScope API:   ${status.dashscope_commands.method} (${status.dashscope_commands.source})  ${status.dashscope_commands.masked}`,
    );
  } else {
    emitBare("    DashScope API:   unavailable");
  }
  if (status.console_gateway_commands) {
    emitBare(
      `    Console gateway: ${status.console_gateway_commands.method} (${status.console_gateway_commands.source})  ${status.console_gateway_commands.masked}`,
    );
  } else {
    emitBare(`    Console gateway: unavailable (run ${config.binName} auth login --console)`);
  }
}

export default defineCommand({
  description: "Show current authentication state",
  auth: "none",
  options: [
    { flag: "--console-region <region>", description: "Console region" },
    {
      flag: "--console-site <site>",
      description: "Console site: domestic, international",
    },
    {
      flag: "--console-switch-agent <uid>",
      description: "Switch agent UID",
      type: "number",
    },
  ],
  exampleArgs: ["", "--output json"],
  async run(config: Config, _flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const status = await buildStatus(config);

    if (!hasAnyAuth(status)) {
      const result = {
        authenticated: false,
        message: "Not authenticated.",
        hint: [
          `DashScope API: ${config.binName} auth login --api-key <key> or DASHSCOPE_API_KEY`,
          `Console gateway: ${config.binName} auth login --console or DASHSCOPE_ACCESS_TOKEN`,
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

    emitTextStatus(status, config);
  },
});
