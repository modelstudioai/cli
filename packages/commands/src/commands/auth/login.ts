import { defineCommand } from "bailian-cli-core";
import { printQuickStart } from "bailian-cli-runtime";
import { emitBare } from "bailian-cli-runtime";
import {
  resolveConsoleOrigin,
  runConsoleLogin,
  validateAndPersistApiKey,
} from "./login-console.ts";

export default defineCommand({
  description: "Authenticate with API key or console browser login (credentials can coexist)",
  auth: "none",
  usageArgs: "--api-key <key> | --console",
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
  },
  exampleArgs: ["--api-key sk-xxxxx", "--console"],
  validate: (f) => (!f.console && !f.apiKey ? "Provide --api-key or --console" : undefined),
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const store = ctx.authStore();
    const deps = { identity, settings, authStore: store };
    if (flags.console) {
      if (settings.dryRun) {
        emitBare(
          "Would bind a free port on 127.0.0.1 and open the console login URL in your browser.",
        );
        return;
      }
      const hasApiKey = !!(flags.apiKey || store.stored().apiKey);
      await runConsoleLogin(resolveConsoleOrigin(settings.consoleSite || "domestic"), deps, {
        needApiKey: !hasApiKey,
      });
      return;
    }

    // --api-key path; validate() guarantees apiKey on the non-console branch.
    if (flags.apiKey) {
      const key = flags.apiKey;
      const baseUrl = flags.baseUrl || undefined;

      if (settings.dryRun) {
        emitBare("Would validate and save API key.");
        return;
      }
      if (baseUrl) {
        await store.login({ base_url: baseUrl });
      }
      await validateAndPersistApiKey(deps, key, baseUrl || store.resolveBaseUrl());
      printQuickStart();
    }
  },
});
