import {
  defineCommand,
  isInteractive,
  maskToken,
  readConfigFile,
  writeConfigFile,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { printQuickStart } from "../../output/banner.ts";
import { emitBare } from "../../output/output.ts";
import { promptConfirm } from "../../output/prompt.ts";
import { printCurrentCommandHelp } from "../../utils/command-help.ts";
import {
  resolveConsoleOrigin,
  runConsoleLogin,
  validateAndPersistApiKey,
} from "./login-console.ts";

export default defineCommand({
  name: "auth login",
  description: "Authenticate with API key or console browser login (credentials can coexist)",
  usage: "bl auth login --api-key <key> | bl auth login --console",
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
  examples: ["bl auth login --api-key sk-xxxxx", "bl auth login --console"],
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
      const maskedEnvKey = maskToken(envKey);
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const proceed = await promptConfirm({
          message: `Detected DASHSCOPE_API_KEY in environment (${maskedEnvKey}).\nYou are already authenticated via env.\nDo you still want to configure local persistent credentials?`,
          initialValue: false,
        });
        if (!proceed) {
          process.stdout.write("Login skipped. Using environment variables.\n");
          process.exit(0);
        }
      } else {
        process.stderr.write(`Warning: DASHSCOPE_API_KEY is already set in environment.\n`);
      }
    }

    const key = (flags.apiKey as string) || config.apiKey;
    if (!key) {
      printCurrentCommandHelp(process.stderr);
      process.exit(0);
    }

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
