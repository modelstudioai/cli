import { defineCommand, readConfigFile, writeConfigFile } from "bailian-cli-core";
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
    const { config, flags } = ctx;
    if (flags.console) {
      if (config.dryRun) {
        emitBare(
          "Would bind a free port on 127.0.0.1 and open the console login URL in your browser.",
        );
        return;
      }
      const hasApiKey = !!(config.apiKey || config.fileApiKey);
      await runConsoleLogin(resolveConsoleOrigin(config.consoleSite || "domestic"), config, {
        needApiKey: !hasApiKey,
      });
      return;
    }

    // --api-key path; validate() guarantees apiKey on the non-console branch.
    if (flags.apiKey) {
      const key = flags.apiKey;
      const baseUrl = flags.baseUrl || undefined;
      const effectiveConfig = baseUrl ? { ...config, baseUrl } : config;

      if (config.dryRun) {
        emitBare("Would validate and save API key.");
        return;
      }
      if (baseUrl) {
        const existing = readConfigFile() as Record<string, unknown>;
        existing.base_url = baseUrl;
        await writeConfigFile(existing);
      }
      await validateAndPersistApiKey(effectiveConfig, key, effectiveConfig.baseUrl);
      printQuickStart();
    }
  },
});
