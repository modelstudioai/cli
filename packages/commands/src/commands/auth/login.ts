import {
  defineCommand,
  generateCLIAccessToken,
  getModelProfilePreset,
  normalizeModelBaseUrl,
} from "bailian-cli-core";
import { emitBare } from "bailian-cli-runtime";
import { validateAndPersistApiKey } from "./login-api-key.ts";
import { resolveConsoleOrigin, runConsoleLogin } from "./login-console.ts";

const LOGIN_MODE_HINT = "Choose exactly one login mode: --api-key, --console, or --open-api";

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export default defineCommand({
  description: {
    "en-US":
      "Authenticate with API key, console browser login, or OpenAPI AK/SK (credentials can coexist)",
    "zh-CN": "使用 API Key、控制台浏览器登录或 OpenAPI AK/SK 进行认证（多种凭证可共存）",
  },
  auth: "none",
  usageArgs:
    "--api-key <key> | --console | --open-api --access-key-id <id> --access-key-secret <secret>",
  flags: {
    apiKey: {
      type: "string",
      valueHint: "<key>",
      description: { "en-US": "Model API key to store", "zh-CN": "要保存的模型 API Key" },
    },
    baseUrl: {
      type: "string",
      valueHint: "<url>",
      description: {
        "en-US": "Model API base URL (used with --api-key for validation)",
        "zh-CN": "模型 API Base URL（用于配合 --api-key 进行验证）",
      },
    },
    console: {
      type: "switch",
      description: {
        "en-US":
          "Sign in via browser; use --console-site to choose domestic (default) or international",
        "zh-CN": "通过浏览器登录；使用 --console-site 选择国内站（默认）或国际站",
      },
    },
    consoleSite: {
      type: "string",
      valueHint: "<site>",
      description: {
        "en-US": "Console site: domestic, international",
        "zh-CN": "控制台站点：domestic、international",
      },
    },
    openApi: {
      type: "switch",
      description: {
        "en-US": "Store Alibaba Cloud OpenAPI AK/SK credentials",
        "zh-CN": "保存阿里云 OpenAPI AK/SK 凭证",
      },
    },
    accessKeyId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Alibaba Cloud Access Key ID to store",
        "zh-CN": "要保存的阿里云 Access Key ID",
      },
    },
    accessKeySecret: {
      type: "string",
      valueHint: "<secret>",
      description: {
        "en-US": "Alibaba Cloud Access Key Secret to store",
        "zh-CN": "要保存的阿里云 Access Key Secret",
      },
    },
  },
  exampleArgs: [
    "--api-key sk-xxxxx",
    "--config token-plan --api-key sk-sp-xxxxx",
    "--console",
    "--open-api --access-key-id LTAIxxxxx --access-key-secret xxxxx",
  ],
  validate: (f) => {
    const apiKeyMode = hasValue(f.apiKey);
    const consoleMode = f.console === true;
    const openApiMode = f.openApi === true;

    // Mode-specific options must not imply a login mode by themselves; this keeps
    // `auth login` explicit and avoids silently ignoring flags from another mode.
    if (!apiKeyMode && hasValue(f.baseUrl)) {
      return "Use --base-url only with --api-key";
    }
    if (!consoleMode && hasValue(f.consoleSite)) {
      return "Use --console-site only with --console";
    }
    if (!openApiMode && (hasValue(f.accessKeyId) || hasValue(f.accessKeySecret))) {
      return "Use --open-api with --access-key-id and --access-key-secret";
    }

    // Login writes one credential domain per invocation. Multi-mode inputs such
    // as `--console --api-key` are rejected instead of partly applying one path.
    const modeCount = [apiKeyMode, consoleMode, openApiMode].filter(Boolean).length;
    if (modeCount !== 1) return LOGIN_MODE_HINT;

    // AK/SK are a credential pair. `auth login --open-api` persists exactly what
    // the user typed and does not fill the missing half from env/config.
    if (openApiMode && (!hasValue(f.accessKeyId) || !hasValue(f.accessKeySecret))) {
      return "Provide --access-key-id and --access-key-secret with --open-api";
    }

    return undefined;
  },
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const store = ctx.authStore;
    const deps = { identity, settings, authStore: store };
    const key = flags.apiKey;
    const baseUrl = flags.baseUrl ? normalizeModelBaseUrl(flags.baseUrl) : undefined;

    if (flags.console) {
      if (settings.dryRun) {
        emitBare(
          "Would bind a free port on 127.0.0.1 and open the console login URL in your browser.",
        );
        return;
      }
      const hasApiKey = !!(key || store.stored().apiKey);
      // 本次登录站点:参数缺省时用配置默认(file 里上次登录存的站点)。
      const site = flags.consoleSite || settings.consoleSite || "domestic";
      await runConsoleLogin(resolveConsoleOrigin(site), deps, {
        needApiKey: !hasApiKey,
      });
      return;
    }

    if (flags.openApi) {
      if (settings.dryRun) {
        emitBare("Would save OpenAPI AK/SK credentials and generate CLI access token.");
        return;
      }
      const resolvedBaseUrl = store.resolveBaseUrl();
      process.stderr.write("Generating CLI access token... ");
      const resp = await generateCLIAccessToken({
        identity,
        settings,
        baseUrl: resolvedBaseUrl,
        accessKeyId: flags.accessKeyId!,
        accessKeySecret: flags.accessKeySecret!,
      });
      const accessToken = resp.cliAccessToken;
      await store.login({
        access_key_id: flags.accessKeyId,
        access_key_secret: flags.accessKeySecret,
        access_token: accessToken,
      });
      process.stderr.write(`OpenAPI credentials saved to ${store.path}\n`);
      return;
    }

    // --api-key path; validate() guarantees apiKey on the non-console branch.
    if (!key) return;

    if (settings.dryRun) {
      emitBare("Would validate and save API key.");
      return;
    }
    const profilePreset = getModelProfilePreset(settings.configName);
    const stored = store.stored();
    const storedBaseUrl = stored.baseUrl;
    const resolvedBaseUrl = baseUrl || store.resolveBaseUrl(profilePreset?.baseUrl);
    const persistBaseUrl = baseUrl || (!storedBaseUrl ? profilePreset?.baseUrl : undefined);
    const apiKeyCapabilities = profilePreset
      ? [...new Set([...(stored.apiKeyCapabilities ?? []), ...profilePreset.apiKeyCapabilities])]
      : stored.apiKeyCapabilities;
    await validateAndPersistApiKey(deps, key, {
      baseUrl: resolvedBaseUrl,
      persistBaseUrl,
      defaultTextModel: profilePreset?.defaultTextModel,
      defaultVideoModel: profilePreset?.defaultVideoModel,
      defaultImageToVideoModel: profilePreset?.defaultImageToVideoModel,
      defaultReferenceToVideoModel: profilePreset?.defaultReferenceToVideoModel,
      defaultImageModel: profilePreset?.defaultImageModel,
      defaultSpeechModel: profilePreset?.defaultSpeechModel,
      defaultSpeechRecognitionModel: profilePreset?.defaultSpeechRecognitionModel,
      apiKeyCapabilities,
    });
  },
});
