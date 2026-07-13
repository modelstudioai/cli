import { defineCommand, getConfigPath } from "bailian-cli-core";
import { emitBare } from "bailian-cli-runtime";
import {
  resolveConsoleOrigin,
  runConsoleLogin,
  validateAndPersistApiKey,
} from "./login-console.ts";

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
    apiKey: { type: "string", valueHint: "<key>", description: "DashScope API key to store" },
    baseUrl: {
      type: "string",
      valueHint: "<url>",
      description: "DashScope API base URL (used with --api-key for validation)",
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
    const baseUrl = flags.baseUrl || undefined;

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
        emitBare("Would save OpenAPI AK/SK credentials.");
        return;
      }
      await store.login({
        access_key_id: flags.accessKeyId,
        access_key_secret: flags.accessKeySecret,
      });
      process.stderr.write(`OpenAPI credentials saved to ${getConfigPath()}\n`);
      return;
    }

    // --api-key path; validate() guarantees apiKey on the non-console branch.
    if (!key) return;

    if (settings.dryRun) {
      emitBare("Would validate and save API key.");
      return;
    }
    if (baseUrl) {
      await store.login({ base_url: baseUrl });
    }
    await validateAndPersistApiKey(deps, key, baseUrl || store.resolveBaseUrl());
  },
});
