import { defineCommand } from "bailian-cli-core";

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

    const scope = flags.console ? "console" : flags.openApi ? "openapi" : "all";
    const hasStoredAuth =
      scope === "console"
        ? stored.console
        : scope === "openapi"
          ? stored.openapi
          : !!(stored.apiKey || stored.console || stored.openapi || stored.baseUrl);
    const fields =
      scope === "console"
        ? "access_token"
        : scope === "openapi"
          ? "access_key_id / access_key_secret / security_token"
          : "api_key / base_url / access_token / access_key_id / access_key_secret / security_token";
    const empty =
      scope === "console"
        ? {
            "en-US": "No console access_token to clear.",
            "zh-CN": "没有可清除的控制台 access_token。",
          }
        : scope === "openapi"
          ? {
              "en-US": "No OpenAPI AK/SK credentials to clear.",
              "zh-CN": "没有可清除的 OpenAPI AK/SK 凭证。",
            }
          : {
              "en-US": "No credentials or model Base URL to clear.",
              "zh-CN": "没有可清除的凭证或模型 Base URL。",
            };
    if (settings.dryRun) {
      ctx.output.result(
        {
          action: "auth.logout",
          scope,
          would_clear: hasStoredAuth,
          config: settings.configName ?? "default",
          config_file: store.path,
        },
        {
          text: [
            ctx.localize(
              hasStoredAuth
                ? {
                    "en-US": `Would clear ${fields} from ${store.path}`,
                    "zh-CN": `将从 ${store.path} 清除 ${fields}`,
                  }
                : empty,
            ),
            ctx.localize({ "en-US": "No changes made.", "zh-CN": "未进行任何修改。" }),
          ].join("\n"),
        },
      );
      return;
    }
    const cleared = await store.logout(scope);
    const lines = [
      ctx.localize(
        cleared
          ? {
              "en-US": `Cleared ${fields} from ${store.path}`,
              "zh-CN": `已从 ${store.path} 清除 ${fields}`,
            }
          : empty,
      ),
    ];
    if (cleared && scope === "console" && stored.apiKey)
      lines.push(
        ctx.localize({
          "en-US": "api_key is still configured and will be used for authentication.",
          "zh-CN": "api_key 仍已配置，将用于认证。",
        }),
      );
    if (cleared && scope === "openapi" && (stored.apiKey || stored.console))
      lines.push(
        ctx.localize({
          "en-US": "Other credentials are still configured and will be used for authentication.",
          "zh-CN": "其他凭证仍已配置，将用于认证。",
        }),
      );
    ctx.output.result(
      {
        action: "auth.logout",
        scope,
        cleared,
        config: settings.configName ?? "default",
        config_file: store.path,
      },
      { text: lines.join("\n") },
    );
  },
});
