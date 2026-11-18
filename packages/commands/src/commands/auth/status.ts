import { formatCommand } from "bailian-cli-core";
import { defineCommand, detectOutputFormat, maskToken } from "bailian-cli-core";
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
          "en-US": `No model API key is configured. Model commands need: ${formatCommand(identity, "auth login --console")}, or ${formatCommand(identity, "auth login --api-key <key>")}`,
          "zh-CN": `尚未配置模型 API Key。模型命令需要：${formatCommand(identity, "auth login --console")}，或 ${formatCommand(identity, "auth login --api-key <key>")}`,
        });

    if (!authenticated) {
      ctx.output.result({
        authenticated: false,
        config: configName,
        config_file: configFile,
        message: "Not authenticated.",
        hint: [
          `API key (model):   ${formatCommand(identity, "auth login --api-key <key>")} or DASHSCOPE_API_KEY`,
          `Console gateway:   ${formatCommand(identity, "auth login --console")}`,
          `OpenAPI (AK/SK):   ${formatCommand(identity, "auth login --open-api")} (or paste --access-key-id / --access-key-secret)`,
          `Get API Key: ${API_KEY_PAGE}`,
        ].join("\n"),
      });
      return;
    }

    if (format !== "text") {
      ctx.output.result({
        authenticated: true,
        config: configName,
        config_file: configFile,
        api_key: apiKey,
        console: consoleCred,
        openapi,
        ...(modelKeyHint ? { hint: modelKeyHint } : {}),
      });
      return;
    }

    const lines = [`Config: ${configName}`];
    lines.push(`Config file: ${configFile}`);
    lines.push("Authentication Status:");
    if (apiKey) {
      lines.push(`  API key (model):  ${apiKey.source}  ${apiKey.masked}`);
    } else {
      lines.push("  API key (model):  not configured");
      if (modelKeyHint) lines.push(`  ${modelKeyHint}`);
    }
    if (consoleCred) {
      lines.push(
        `  Console gateway:  ${consoleCred.source}  ${consoleCred.masked}  (${consoleCred.region}, ${consoleCred.site})`,
      );
    } else {
      lines.push(
        `  Console gateway:  not configured (run ${formatCommand(identity, "auth login --console")})`,
      );
    }
    if (openapi) {
      lines.push(`  OpenAPI (AK/SK):  ${openapi.source}  ${openapi.access_key_id}`);
    } else {
      // 与 Console 行一致：状态一行说完，避免再重复 “未配置”
      const openApiHint = localize({
        "en-US": `run ${formatCommand(identity, "auth login --open-api")} to get an AccessKey via the guide; if you already have one, configure with ${formatCommand(identity, "auth login --open-api --access-key-id <id> --access-key-secret <secret>")}`,
        "zh-CN": `运行 ${formatCommand(identity, "auth login --open-api")} 按照引导获取 AccessKey，若已有 AccessKey，使用 ${formatCommand(identity, "auth login --open-api --access-key-id <id> --access-key-secret <secret>")} 进行配置`,
      });
      lines.push(`  OpenAPI (AK/SK):  not configured (${openApiHint})`);
    }
    ctx.output.result(
      {
        authenticated: true,
        config: configName,
        config_file: configFile,
        api_key: apiKey,
        console: consoleCred,
        openapi,
        ...(modelKeyHint ? { hint: modelKeyHint } : {}),
      },
      { text: lines.join("\n") },
    );
  },
});
