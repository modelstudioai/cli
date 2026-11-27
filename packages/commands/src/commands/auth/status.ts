import {
  defineCommand,
  detectOutputFormat,
  formatCommand,
  formatText,
  maskToken,
} from "bailian-cli-core";
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
    const aliyunOAuth = auth.aliyunOAuth
      ? {
          client_id: auth.aliyunOAuth.client_id,
          scope: auth.aliyunOAuth.scope,
          console_enabled: auth.aliyunOAuth.console_enabled,
          openapi_enabled: auth.aliyunOAuth.openapi_enabled,
          access_token_expires_at: auth.aliyunOAuth.access_token_expires_at,
          sts_expires_at: auth.aliyunOAuth.sts_expires_at,
        }
      : undefined;

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
      : auth.aliyunOAuth?.console_enabled
        ? {
            source: "config",
            method: "aliyun",
            region: auth.aliyunOAuth.console_region,
            site: "domestic",
          }
        : undefined;
    const openapi = auth.openapi
      ? {
          source: auth.openapi.source,
          access_key_id: maskToken(auth.openapi.accessKeyId),
          access_key_secret: maskToken(auth.openapi.accessKeySecret),
        }
      : auth.aliyunOAuth?.openapi_enabled
        ? { source: "config", method: "aliyun" }
        : undefined;

    const authenticated = !!(apiKey || consoleCred || openapi);
    const configName = settings.configName ?? "default";
    const configFile = ctx.authStore.path;
    const pre = settings.preControlPlane !== undefined;
    const controlPlane = pre ? { environment: "pre" } : {};
    const environmentLine = pre
      ? localize({ "en-US": "Control plane: pre-release", "zh-CN": "控制面：预发" })
      : undefined;
    const apiKeyLogin = formatCommand(identity, "auth login --api-key <key>");
    const consoleLogin = formatCommand(identity, "auth login --console");
    const modelKeyHint = apiKey
      ? undefined
      : localize(
          pre
            ? {
                "en-US": `Model commands use separate credentials. To configure a model API key, run ${apiKeyLogin}`,
                "zh-CN": `模型命令使用独立凭证。要配置模型 API Key，请运行 ${apiKeyLogin}`,
              }
            : {
                "en-US": `No model API key is configured. Model commands need: ${consoleLogin}, or ${apiKeyLogin}`,
                "zh-CN": `尚未配置模型 API Key。模型命令需要：${consoleLogin}，或 ${apiKeyLogin}`,
              },
        );

    if (!authenticated) {
      const result = {
        authenticated: false,
        ...(aliyunOAuth ? { aliyun_oauth: aliyunOAuth } : {}),
        config: configName,
        config_file: configFile,
        message: "Not authenticated.",
        hint: [
          `API key (model):   ${apiKeyLogin} or DASHSCOPE_API_KEY`,
          `Console gateway:   ${consoleLogin}`,
          `OpenAPI (AK/SK):   ${formatCommand(identity, "auth login --open-api --access-key-id <id> --access-key-secret <secret>")}`,
          `Get API Key: ${API_KEY_PAGE}`,
        ].join("\n"),
      };
      if (environmentLine) {
        ctx.output.result(
          { ...result, ...controlPlane },
          { text: `${environmentLine}\n${formatText(result)}` },
        );
      } else {
        ctx.output.result(result);
      }
      return;
    }

    if (format !== "text") {
      ctx.output.result({
        authenticated: true,
        config: configName,
        config_file: configFile,
        ...controlPlane,
        api_key: apiKey,
        console: consoleCred,
        openapi,
        ...(aliyunOAuth ? { aliyun_oauth: aliyunOAuth } : {}),
        ...(modelKeyHint ? { hint: modelKeyHint } : {}),
      });
      return;
    }

    const lines = environmentLine
      ? [environmentLine, `Config: ${configName}`]
      : [`Config: ${configName}`];
    lines.push(`Config file: ${configFile}`);
    lines.push("Authentication Status:");
    if (aliyunOAuth)
      lines.push(
        localize({
          "en-US": `  Aliyun OAuth: configured; scope=${aliyunOAuth.scope}`,
          "zh-CN": `  阿里云 OAuth：已配置；scope=${aliyunOAuth.scope}`,
        }),
      );
    if (apiKey) {
      lines.push(`  API key (model):  ${apiKey.source}  ${apiKey.masked}`);
    } else {
      lines.push("  API key (model):  not configured");
      if (modelKeyHint) lines.push(`  ${modelKeyHint}`);
    }
    if (consoleCred) {
      lines.push(
        `  Console gateway:  ${consoleCred.source}  ${consoleCred.masked ?? localize({ "en-US": "OAuth managed", "zh-CN": "OAuth 托管" })}  (${consoleCred.region}, ${consoleCred.site})`,
      );
    } else {
      lines.push(
        `  Console gateway:  not configured (run ${formatCommand(identity, "auth login --console")})`,
      );
    }
    if (openapi) {
      lines.push(
        `  OpenAPI (AK/SK):  ${openapi.source}  ${openapi.access_key_id ?? localize({ "en-US": "OAuth managed", "zh-CN": "OAuth 托管" })}`,
      );
    } else {
      lines.push(
        `  OpenAPI (AK/SK):  not configured (run ${formatCommand(identity, "auth login --open-api")})`,
      );
    }
    ctx.output.result(
      {
        authenticated: true,
        config: configName,
        config_file: configFile,
        ...controlPlane,
        api_key: apiKey,
        console: consoleCred,
        openapi,
        ...(aliyunOAuth ? { aliyun_oauth: aliyunOAuth } : {}),
        ...(modelKeyHint ? { hint: modelKeyHint } : {}),
      },
      { text: lines.join("\n") },
    );
  },
});
