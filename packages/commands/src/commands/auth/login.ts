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
  description:
    "Authenticate with API key, console browser login, or OpenAPI AK/SK (credentials can coexist)",
  auth: "none",
  usageArgs:
    "--api-key <key> | --console | --open-api --access-key-id <id> --access-key-secret <secret>",
  flags: {
    apiKey: {
      type: "string",
      valueHint: "<key>",
      description: "Model API key to store",
    },
    baseUrl: {
      type: "string",
      valueHint: "<url>",
      description: "Model API base URL (used with --api-key for validation)",
    },
    agentstudioBaseUrl: {
      type: "string",
      valueHint: "<url>",
      description:
        "Bailian AgentStudio base URL for `bl managed-agent` commands (sets BAILIAN_BASE_URL; used with --api-key)",
    },
    console: {
      type: "switch",
      description:
        "Sign in via browser; use --console-site to choose domestic (default) or international",
    },
    consoleSite: {
      type: "string",
      valueHint: "<site>",
      description: "Console site: domestic, international",
    },
    openApi: {
      type: "switch",
      description: "Store Alibaba Cloud OpenAPI AK/SK credentials",
    },
    accessKeyId: {
      type: "string",
      valueHint: "<id>",
      description: "Alibaba Cloud Access Key ID to store",
    },
    accessKeySecret: {
      type: "string",
      valueHint: "<secret>",
      description: "Alibaba Cloud Access Key Secret to store",
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
    if (!apiKeyMode && hasValue(f.agentstudioBaseUrl)) {
      return "Use --agentstudio-base-url only with --api-key";
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
    const storedBaseUrl = store.stored().baseUrl;
    const resolvedBaseUrl = baseUrl || store.resolveBaseUrl(profilePreset?.baseUrl);
    const persistBaseUrl = baseUrl || (!storedBaseUrl ? profilePreset?.baseUrl : undefined);
    await validateAndPersistApiKey(deps, key, {
      baseUrl: resolvedBaseUrl,
      persistBaseUrl,
      persistPatch: flags.agentstudioBaseUrl
        ? { agentstudio_base_url: flags.agentstudioBaseUrl }
        : undefined,
      defaultTextModel: profilePreset?.defaultTextModel,
      defaultVideoModel: profilePreset?.defaultVideoModel,
      defaultImageToVideoModel: profilePreset?.defaultImageToVideoModel,
      defaultReferenceToVideoModel: profilePreset?.defaultReferenceToVideoModel,
      defaultImageModel: profilePreset?.defaultImageModel,
    });
  },
});
