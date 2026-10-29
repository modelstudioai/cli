import { defineCommand, detectOutputFormat, maskToken } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { API_KEY_PAGE } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "Show current authentication state",
    "zh-CN": "显示当前认证状态",
  },
  auth: "none",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { identity, settings, localize } = ctx;
    const format = detectOutputFormat(settings.output);
    const auth = ctx.authStore.describe();

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
    const configName = settings.configName ?? "default";
    const configFile = ctx.authStore.path;
    const modelKeyHint = apiKey
      ? undefined
      : localize({
          "en-US": `No model API key is configured. Model commands need: ${identity.binName} auth login --console, or ${identity.binName} auth login --api-key <key>`,
          "zh-CN": `尚未配置模型 API Key。模型命令需要：${identity.binName} auth login --console，或 ${identity.binName} auth login --api-key <key>`,
        });

    if (!authenticated) {
      emitResult(
        {
          authenticated: false,
          config: configName,
          config_file: configFile,
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
      emitResult(
        {
          authenticated: true,
          config: configName,
          config_file: configFile,
          api_key: apiKey,
          console: consoleCred,
          openapi,
          ...(modelKeyHint ? { hint: modelKeyHint } : {}),
        },
        format,
      );
      return;
    }

    emitBare(`Config: ${configName}`);
    emitBare(`Config file: ${configFile}`);
    emitBare("Authentication Status:");
    if (apiKey) {
      emitBare(`  API key (model):  ${apiKey.source}  ${apiKey.masked}`);
    } else {
      emitBare("  API key (model):  not configured");
      if (modelKeyHint) emitBare(`  ${modelKeyHint}`);
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
