import { defineCommand } from "bailian-cli-core";
import { emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "Clear stored credentials; full logout also clears the model Base URL",
    "zh-CN": "清除已保存的凭证；完整退出还会清除模型 Base URL",
  },
  auth: "none",
  usageArgs: "[--console | --open-api] [--dry-run]",
  flags: {
    console: {
      type: "switch",
      description: {
        "en-US": "Only clear the console access_token, keep api_key intact",
        "zh-CN": "仅清除控制台 access_token，保留 api_key",
      },
    },
    openApi: {
      type: "switch",
      description: {
        "en-US": "Only clear OpenAPI AK/SK/STS credentials, keep other credentials intact",
        "zh-CN": "仅清除 OpenAPI AK/SK/STS 凭证，保留其他凭证",
      },
    },
  },
  exampleArgs: ["", "--console", "--open-api", "--dry-run"],
  validate: (f) =>
    f.console && f.openApi ? "Use only one scope: --console or --open-api" : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const store = ctx.authStore;
    const stored = store.stored();

    if (flags.console) {
      if (settings.dryRun) {
        if (stored.console) emitBare(`Would clear access_token from ${store.path}`);
        else emitBare("No console access_token to clear.");
        emitBare("No changes made.");
        return;
      }
      if (await store.logout("console")) {
        process.stderr.write(`Cleared access_token from ${store.path}\n`);
        if (stored.apiKey) {
          process.stderr.write(
            "api_key is still configured and will be used for authentication.\n",
          );
        }
      } else {
        process.stderr.write("No console access_token to clear.\n");
      }
      return;
    }

    if (flags.openApi) {
      if (settings.dryRun) {
        if (stored.openapi)
          emitBare(
            `Would clear access_key_id / access_key_secret / security_token from ${store.path}`,
          );
        else emitBare("No OpenAPI AK/SK credentials to clear.");
        emitBare("No changes made.");
        return;
      }
      if (await store.logout("openapi")) {
        process.stderr.write(
          `Cleared access_key_id / access_key_secret / security_token from ${store.path}\n`,
        );
        if (stored.apiKey || stored.console) {
          process.stderr.write(
            "Other credentials are still configured and will be used for authentication.\n",
          );
        }
      } else {
        process.stderr.write("No OpenAPI AK/SK credentials to clear.\n");
      }
      return;
    }

    const hasStoredAuth = stored.apiKey || stored.console || stored.openapi || !!stored.baseUrl;

    if (settings.dryRun) {
      if (hasStoredAuth)
        emitBare(
          `Would clear api_key / base_url / access_token / access_key_id / access_key_secret / security_token from ${store.path}`,
        );
      else emitBare("No credentials or model Base URL to clear.");
      emitBare("No changes made.");
      return;
    }

    if (await store.logout("all")) {
      process.stderr.write(
        `Cleared api_key / base_url / access_token / access_key_id / access_key_secret / security_token from ${store.path}\n`,
      );
    } else {
      process.stderr.write("No credentials or model Base URL to clear.\n");
    }
  },
});
