import {
  BailianError,
  ExitCode,
  chatEndpoint,
  defineCommand,
  getConfigPath,
  isInteractive,
  maskToken,
  readConfigFile,
  requestJson,
  writeConfigFile,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { printQuickStart } from "../../output/banner.ts";
import { emitBare } from "../../output/output.ts";
import { promptConfirm } from "../../output/prompt.ts";
import { printCurrentCommandHelp } from "../../utils/command-help.ts";
import { resolveConsoleOrigin, runConsoleLogin } from "./login-console.ts";

const RETRY_DELAY_BASE_MS = 500;

function canRetry(err: unknown): boolean {
  if (err instanceof BailianError) {
    if (err.exitCode === ExitCode.NETWORK || err.exitCode === ExitCode.TIMEOUT) {
      return true;
    }
    const status = err.api?.httpStatus;
    return status === 401 || (status !== undefined && status >= 500);
  }
  if (err instanceof Error) {
    return (
      err.name === "AbortError" ||
      err.name === "TimeoutError" ||
      err.message.includes("timed out") ||
      err.message === "fetch failed"
    );
  }
  return false;
}

async function validateKeyAndPersist(config: Config, key: string): Promise<void> {
  process.stderr.write("Testing key... ");

  const testConfig = { ...config, apiKey: key };
  const requestOpts = {
    url: chatEndpoint(testConfig.baseUrl),
    method: "POST",
    timeout: Math.min(config.timeout, 30),
    body: {
      model: "qwen3.7-max",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
    },
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await requestJson<unknown>(testConfig, requestOpts);
      break;
    } catch (err) {
      if (attempt >= 3 || !canRetry(err)) {
        process.stderr.write("\n");
        throw new BailianError("API key validation failed", ExitCode.AUTH, "Invalid API key.", {
          cause: err,
        });
      }
      // retry delay: 500ms, 1000ms, 2000ms
      const delayMs = RETRY_DELAY_BASE_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  process.stderr.write("Valid\n");

  const existing = readConfigFile() as Record<string, unknown>;
  existing.api_key = key;
  await writeConfigFile(existing);
  process.stderr.write(`Saved to ${getConfigPath()}\n`);
}

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
      description: "Sign in via browser; opens the console login URL in your default browser",
      type: "boolean",
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
      await runConsoleLogin(resolveConsoleOrigin(), config, {
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
      await validateKeyAndPersist(effectiveConfig, key);
      if (baseUrl) {
        const existing = readConfigFile() as Record<string, unknown>;
        existing.base_url = baseUrl;
        await writeConfigFile(existing);
      }
      printQuickStart();
    } else {
      emitBare("Would validate and save API key.");
    }
  },
});
