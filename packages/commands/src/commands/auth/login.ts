import {
  defineCommand,
  readConfigFile,
  writeConfigFile,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
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
  options: [
    { flag: "--api-key <key>", description: "DashScope API key to store" },
    {
      flag: "--base-url <url>",
      description: "DashScope API base URL (used with --api-key for validation)",
    },
    {
      flag: "--console",
      description:
        "Sign in via browser; use --console-site to choose domestic (default) or international",
    },
  ],
  exampleArgs: ["--api-key sk-xxxxx", "--console"],
  validate: (f) => (!f.console && !f.apiKey ? "Provide --api-key or --console" : undefined),
  async run(config: Config, flags: GlobalFlags) {
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

    const envKey = process.env.DASHSCOPE_API_KEY;
    if (envKey && !flags.apiKey) {
      process.stderr.write(`Warning: DASHSCOPE_API_KEY is already set in environment.\n`);
    }

    const key = flags.apiKey as string;

    const baseUrl = (flags.baseUrl as string) || undefined;
    const effectiveConfig = baseUrl ? { ...config, baseUrl } : config;

    if (!config.dryRun) {
      if (baseUrl) {
        const existing = readConfigFile() as Record<string, unknown>;
        existing.base_url = baseUrl;
        await writeConfigFile(existing);
      }
      await validateAndPersistApiKey(effectiveConfig, key, effectiveConfig.baseUrl);
      printQuickStart();
    } else {
      emitBare("Would validate and save API key.");
    }
  },
});
