import { defineCommand, describeAuth, detectOutputFormat, maskToken } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { API_KEY_PAGE } from "bailian-cli-runtime";

export default defineCommand({
  description: "Show current authentication state",
  auth: "none",
  exampleArgs: ["", "--output json"],
  flags: {
    consoleRegion: { type: "string", valueHint: "<region>", description: "Console region" },
    consoleSite: {
      type: "string",
      valueHint: "<site>",
      description: "Console site: domestic, international",
    },
    consoleSwitchAgent: { type: "number", valueHint: "<uid>", description: "Switch agent UID" },
  },
  async run(ctx) {
    const { config } = ctx;
    const format = detectOutputFormat(config.output);
    const auth = await describeAuth(config);

    const apiKey = auth.apiKey
      ? {
          source: auth.apiKey.source,
          masked: maskToken(auth.apiKey.token),
          base_url: auth.apiKey.baseUrl,
        }
      : undefined;
    const consoleCred = auth.console
      ? {
          source: auth.console.source,
          masked: maskToken(auth.console.token),
          region: auth.console.region,
          site: auth.console.site,
        }
      : undefined;

    const authenticated = !!(apiKey || consoleCred);

    if (!authenticated) {
      emitResult(
        {
          authenticated: false,
          message: "Not authenticated.",
          hint: [
            `API key (model):   ${config.binName} auth login --api-key <key> or DASHSCOPE_API_KEY`,
            `Console gateway:   ${config.binName} auth login --console`,
            `Get API Key: ${API_KEY_PAGE}`,
          ].join("\n"),
        },
        format,
      );
      return;
    }

    if (format !== "text") {
      emitResult({ authenticated: true, api_key: apiKey, console: consoleCred }, format);
      return;
    }

    emitBare("Authentication Status:");
    if (apiKey) {
      emitBare(`  API key (model):  ${apiKey.source}  ${apiKey.masked}`);
    } else {
      emitBare("  API key (model):  not configured");
    }
    if (consoleCred) {
      emitBare(
        `  Console gateway:  ${consoleCred.source}  ${consoleCred.masked}  (${consoleCred.region}, ${consoleCred.site})`,
      );
    } else {
      emitBare(`  Console gateway:  not configured (run ${config.binName} auth login --console)`);
    }
  },
});
