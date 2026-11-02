import {
  defineCommand,
  BailianError,
  ExitCode,
  CONSOLE_AUTH_FLAGS,
  generateCLIAccessToken,
  resolveCLIAccessTokenTarget,
  validateConsoleAccessToken,
  getModelProfilePreset,
  normalizeModelBaseUrl,
} from "bailian-cli-core";
import { persistApiKey, validateApiKey } from "./login-api-key.ts";
import { resolveConsoleOrigin, runConsoleLogin, runConsoleTokenLogin } from "./login-console.ts";

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
    "--api-key <key> | --console [--no-browser | --token-stdin --console-region <region>] | --open-api --access-key-id <id> --access-key-secret <secret>",
  flags: {
    apiKey: {
      type: "string",
      valueHint: "<key>",
      description: {
        "en-US": "Model API key to validate and store",
        "zh-CN": "要校验并保存的模型 API Key",
      },
    },
    baseUrl: {
      type: "string",
      valueHint: "<url>",
      description: {
        "en-US": "Model API base URL to validate and store with --api-key",
        "zh-CN": "与 --api-key 一并校验并保存的模型 API Base URL",
      },
    },
    console: {
      type: "switch",
      description: {
        "en-US":
          "Sign in via browser (China by default; use --console-site international for the international site). Creates an ordinary API key if needed; subscription plans require --api-key",
        "zh-CN":
          "通过浏览器登录（默认中国站；国际站使用 --console-site international）。需要时会创建普通 API Key；订阅计划必须使用 --api-key 登录",
      },
    },
    noBrowser: {
      type: "switch",
      description: {
        "en-US": "With --console, print the login URL without opening a browser",
        "zh-CN": "与 --console 一起使用，只打印登录地址，不自动打开浏览器",
      },
    },
    tokenStdin: {
      type: "switch",
      description: {
        "en-US":
          "With --console, read one raw access token from piped stdin and validate before saving; requires --console-region, no browser or local server",
        "zh-CN":
          "与 --console 一起使用，从管道 stdin 读取原始 access token，校验后保存；必须指定 --console-region，不启动浏览器或本地服务",
      },
    },
    consoleRegion: {
      ...CONSOLE_AUTH_FLAGS.consoleRegion,
      choices: ["cn-beijing", "ap-southeast-1"],
    },
    consoleSite: {
      type: "string",
      valueHint: "<site>",
      choices: ["domestic", "international"],
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
    "--console",
    "--console --no-browser --console-site international",
    "--console --token-stdin --console-site international --console-region ap-southeast-1",
    "--api-key sk-xxxxx",
    "--open-api --access-key-id LTAIxxxxx --access-key-secret xxxxx",
  ],
  validate: (flags) => {
    const apiKeyMode = hasValue(flags.apiKey);
    const consoleMode = flags.console === true;
    const openApiMode = flags.openApi === true;

    if (!consoleMode && (flags.noBrowser || flags.tokenStdin || hasValue(flags.consoleRegion))) {
      return "Use --no-browser, --token-stdin and --console-region only with --console. / --no-browser、--token-stdin 和 --console-region 只能与 --console 一起使用。";
    }
    if (flags.noBrowser && flags.tokenStdin) {
      return "Choose either --no-browser or --token-stdin. / --no-browser 与 --token-stdin 不能同时使用。";
    }
    if (flags.tokenStdin && !hasValue(flags.consoleRegion)) {
      return "Provide --console-region with --token-stdin. / 使用 --token-stdin 时必须指定 --console-region。";
    }
    if (!flags.tokenStdin && hasValue(flags.consoleRegion)) {
      return "Use --console-region only with --console --token-stdin. / --console-region 只能与 --console --token-stdin 一起使用。";
    }

    // Mode-specific options must not imply a login mode by themselves; this keeps
    // `auth login` explicit and avoids silently ignoring flags from another mode.
    if (!apiKeyMode && hasValue(flags.baseUrl)) {
      return "Use --base-url only with --api-key";
    }
    if (!consoleMode && hasValue(flags.consoleSite)) {
      return "Use --console-site only with --console";
    }
    if (!openApiMode && (hasValue(flags.accessKeyId) || hasValue(flags.accessKeySecret))) {
      return "Use --open-api with --access-key-id and --access-key-secret";
    }

    // Login writes one credential domain per invocation. Multi-mode inputs such
    // as `--console --api-key` are rejected instead of partly applying one path.
    const modeCount = [apiKeyMode, consoleMode, openApiMode].filter(Boolean).length;
    if (modeCount !== 1) return LOGIN_MODE_HINT;

    // AK/SK are a credential pair. `auth login --open-api` persists exactly what
    // the user typed and does not fill the missing half from env/config.
    if (openApiMode && (!hasValue(flags.accessKeyId) || !hasValue(flags.accessKeySecret))) {
      return "Provide --access-key-id and --access-key-secret with --open-api";
    }

    return undefined;
  },
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const store = ctx.authStore;
    const deps = {
      identity,
      settings,
      authStore: store,
      localize: ctx.localize,
      output: ctx.output,
      debug: (record: Parameters<typeof ctx.output.debug>[0]) => ctx.output.debug(record),
    };
    const finish = (method: string, text: string) =>
      ctx.output.result(
        {
          authenticated: true,
          method,
          config: settings.configName ?? "default",
          config_file: store.path,
        },
        { text },
      );
    const key = flags.apiKey;
    const baseUrl = flags.baseUrl ? normalizeModelBaseUrl(flags.baseUrl) : undefined;

    if (flags.console) {
      if (settings.dryRun) {
        ctx.output.result(
          {
            action: "auth.login",
            method: "console",
            token_stdin: !!flags.tokenStdin,
            no_browser: !!flags.noBrowser,
            config_file: store.path,
          },
          {
            text: ctx.localize(
              flags.tokenStdin
                ? {
                    "en-US":
                      "Would read a console token from stdin, validate it and save it without opening a browser or local server.",
                    "zh-CN": "将从 stdin 读取控制台 token，校验后保存，不启动浏览器或本地服务。",
                  }
                : flags.noBrowser
                  ? {
                      "en-US":
                        "Would bind a free port on 127.0.0.1 and print the console login URL without opening a browser.",
                      "zh-CN":
                        "将在 127.0.0.1 监听空闲端口并打印控制台登录地址，不自动打开浏览器。",
                    }
                  : {
                      "en-US":
                        "Would bind a free port on 127.0.0.1 and open the console login URL in your browser.",
                      "zh-CN": "将在 127.0.0.1 监听空闲端口并在浏览器中打开控制台登录地址。",
                    },
            ),
          },
        );
        return;
      }
      if (settings.output === "json" && !flags.tokenStdin)
        throw new BailianError(
          ctx.localize({
            "en-US":
              "Browser login requires text output. Use --output text, or --console --token-stdin with --console-region for JSON output.",
            "zh-CN":
              "浏览器登录需要文本输出。请使用 --output text，或通过 --console --token-stdin 和 --console-region 使用 JSON 输出。",
          }),
          ExitCode.USAGE,
        );
      const hasApiKey = !!(key || store.stored().apiKey);
      // 本次登录站点:参数缺省时用配置默认(file 里上次登录存的站点)。
      const site = flags.consoleSite || settings.consoleSite || "domestic";
      if (flags.tokenStdin) {
        await runConsoleTokenLogin(deps, {
          site: site as "domestic" | "international",
          region: flags.consoleRegion!,
          switchAgent: settings.consoleSwitchAgent,
        });
        finish(
          "console",
          ctx.localize({
            "en-US": `Console token validated and saved to ${store.path}`,
            "zh-CN": `控制台 token 已校验并保存至 ${store.path}`,
          }),
        );
        return;
      }
      await runConsoleLogin(resolveConsoleOrigin(site), deps, {
        needApiKey: !hasApiKey,
        noBrowser: flags.noBrowser,
      });
      finish(
        "console",
        ctx.localize({
          "en-US": `Config saved to ${store.path}`,
          "zh-CN": `配置已保存至 ${store.path}`,
        }),
      );
      return;
    }

    if (flags.openApi) {
      if (settings.dryRun) {
        ctx.output.result(
          { action: "auth.login", method: "openapi", config_file: store.path },
          {
            text: ctx.localize({
              "en-US": "Would save OpenAPI AK/SK credentials and generate CLI access token.",
              "zh-CN": "将保存 OpenAPI AK/SK 凭证并生成 CLI access token。",
            }),
          },
        );
        return;
      }
      const resolvedBaseUrl = store.resolveBaseUrl();
      const target = resolveCLIAccessTokenTarget(settings, resolvedBaseUrl);
      ctx.output.progress({
        "en-US": "Generating CLI access token...",
        "zh-CN": "正在生成 CLI access token...",
      });
      const resp = await generateCLIAccessToken({
        identity,
        settings,
        debug: (record) => ctx.output.debug(record),
        baseUrl: resolvedBaseUrl,
        accessKeyId: flags.accessKeyId!,
        accessKeySecret: flags.accessKeySecret!,
      });
      const accessToken = resp.cliAccessToken;
      await validateConsoleAccessToken({ ...target, token: accessToken }, settings, {
        debug: (record) => ctx.output.debug(record),
      });
      await store.login({
        access_key_id: flags.accessKeyId,
        access_key_secret: flags.accessKeySecret,
        access_token: accessToken,
        console_region: target.region,
        console_site: target.site,
      });
      finish(
        "openapi",
        ctx.localize({
          "en-US": `OpenAPI credentials saved to ${store.path}`,
          "zh-CN": `OpenAPI 凭证已保存至 ${store.path}`,
        }),
      );
      return;
    }

    // --api-key path; validate() guarantees apiKey on the non-console branch.
    if (!key) return;

    if (settings.dryRun) {
      ctx.output.result(
        { action: "auth.login", method: "api_key", config_file: store.path },
        {
          text: ctx.localize({
            "en-US": "Would validate and save API key.",
            "zh-CN": "将校验并保存 API Key。",
          }),
        },
      );
      return;
    }
    const stored = store.stored();
    const validation = await validateApiKey(deps, key, {
      explicitBaseUrl: baseUrl,
      storedBaseUrl: stored.baseUrl,
      workspaceId: settings.workspaceId,
    });
    const profilePreset = getModelProfilePreset(
      validation.kind === "token-plan" ? "token-plan" : undefined,
    );
    await persistApiKey(deps, key, {
      persistBaseUrl: validation.baseUrl,
      defaultTextModel: profilePreset?.defaultTextModel,
      defaultVideoModel: profilePreset?.defaultVideoModel,
      defaultImageToVideoModel: profilePreset?.defaultImageToVideoModel,
      defaultReferenceToVideoModel: profilePreset?.defaultReferenceToVideoModel,
      defaultImageModel: profilePreset?.defaultImageModel,
      defaultSpeechModel: profilePreset?.defaultSpeechModel,
      defaultSpeechRecognitionModel: profilePreset?.defaultSpeechRecognitionModel,
      apiKeyCapabilities: profilePreset?.apiKeyCapabilities,
    });
    finish(
      "api_key",
      ctx.localize({
        "en-US": `API key validated and saved to ${store.path}`,
        "zh-CN": `API Key 已校验并保存至 ${store.path}`,
      }),
    );
  },
});
