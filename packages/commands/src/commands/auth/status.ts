import { defineCommand, detectOutputFormat, maskToken } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { API_KEY_PAGE } from "bailian-cli-runtime";

export default defineCommand({
  description: "Show current authentication state",
  auth: "none",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { identity, settings } = ctx;
    const format = detectOutputFormat(settings.output);
    const auth = ctx.authStore().describe();

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
    const openapi = auth.openapi
      ? {
          source: auth.openapi.source,
          access_key_id: maskToken(auth.openapi.accessKeyId),
          access_key_secret: maskToken(auth.openapi.accessKeySecret),
        }
      : undefined;

    const authenticated = !!(apiKey || consoleCred || openapi);

    if (!authenticated) {
      emitResult(
        {
          authenticated: false,
          message: "Not authenticated.",
          hint: [
            `API key (model):   ${identity.binName} auth login --api-key <key> or DASHSCOPE_API_KEY`,
            `Console gateway:   ${identity.binName} auth login --console`,
            `OpenAPI (AK/SK):   ${identity.binName} auth login --open-api --access-key-id <id> --access-key-secret <secret>`,
            `Get API Key: ${API_KEY_PAGE}`,
          ].join("\n"),
        },
        format,
      );
      return;
    }

    if (format !== "text") {
      emitResult({ authenticated: true, api_key: apiKey, console: consoleCred, openapi }, format);
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
      emitBare(`  Console gateway:  not configured (run ${identity.binName} auth login --console)`);
    }
    if (openapi) {
      emitBare(`  OpenAPI (AK/SK):  ${openapi.source}  ${openapi.access_key_id}`);
    } else {
      emitBare(
        `  OpenAPI (AK/SK):  not configured (run ${identity.binName} auth login --open-api)`,
      );
    }
  },
});
