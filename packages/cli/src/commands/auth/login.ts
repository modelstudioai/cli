import {
  AUTH_MODES,
  BailianError,
  CODING_PLAN_REGIONS,
  ExitCode,
  TOKEN_PLAN_REGIONS,
  chatEndpoint,
  defineCommand,
  getConfigPath,
  isInteractive,
  maskToken,
  readConfigFile,
  requestJson,
  writeConfigFile,
  type AuthMode,
  type CodingPlanRegion,
  type Config,
  type GlobalFlags,
  type TokenPlanRegion,
} from "bailian-cli-core";
import { printQuickStart } from "../../output/banner.ts";
import { emitBare } from "../../output/output.ts";
import { promptConfirm } from "../../output/prompt.ts";
import { interactiveAuthSetup } from "../../utils/auth-wizard.ts";
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

async function validateKeyAndPersist(
  config: Config,
  key: string,
  mode: AuthMode,
  codingPlanRegion: CodingPlanRegion,
  tokenPlanRegion: TokenPlanRegion,
): Promise<void> {
  process.stderr.write("Testing key... ");
  const testConfig: Config = {
    ...config,
    activeAuthMode: mode,
    apiKey: undefined,
    fileApiKey: mode === "standard-api-key" ? key : undefined,
    codingPlanApiKey: mode === "coding-plan" ? key : config.codingPlanApiKey,
    codingPlanRegion,
    tokenPlanApiKey: mode === "token-plan" ? key : config.tokenPlanApiKey,
    tokenPlanRegion,
  };
  const requestOpts = {
    url: chatEndpoint(testConfig),
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
      const delayMs = RETRY_DELAY_BASE_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  process.stderr.write("Valid\n");

  const existing = readConfigFile() as Record<string, unknown>;
  existing.active_auth_mode = mode;
  if (mode === "standard-api-key") existing.api_key = key;
  if (mode === "coding-plan") {
    existing.coding_plan_api_key = key;
    existing.coding_plan_region = codingPlanRegion;
  }
  if (mode === "token-plan") {
    existing.token_plan_api_key = key;
    existing.token_plan_region = tokenPlanRegion;
  }
  await writeConfigFile(existing);
  process.stderr.write(`Active auth mode set to ${mode}\n`);
  process.stderr.write(`Saved to ${getConfigPath()}\n`);
}

export default defineCommand({
  name: "auth login",
  description: "Authenticate with API key, console browser login, or interactive wizard",
  usage: "bl auth login --mode <mode> --api-key <key> | bl auth login --console",
  options: [
    {
      flag: "--mode <mode>",
      description: "Auth mode: standard-api-key, coding-plan, token-plan",
    },
    { flag: "--api-key <key>", description: "API key for the selected auth mode" },
    { flag: "--coding-plan-api-key <key>", description: "Coding Plan API key (sets mode)" },
    { flag: "--coding-plan-region <region>", description: "Coding Plan region: cn, intl" },
    { flag: "--token-plan-api-key <key>", description: "Token Plan API key (sets mode)" },
    { flag: "--token-plan-region <region>", description: "Token Plan region: cn, intl" },
    {
      flag: "--console",
      description: "Sign in via browser; opens the console login URL in your default browser",
      type: "boolean",
    },
  ],
  examples: [
    "bl auth login --api-key sk-xxxxx",
    "bl auth login --mode coding-plan --api-key sk-sp-xxxxx",
    "bl auth login --token-plan-api-key sk-xxxxx --token-plan-region intl",
    "bl auth login --console",
  ],
  async run(config: Config, flags: GlobalFlags) {
    // Console login branch (cli-specific)
    if (flags.console) {
      if (config.dryRun) {
        emitBare(
          "Would bind a free port on 127.0.0.1 and open the console login URL in your browser.",
        );
        return;
      }
      const hasApiKey = !!(config.apiKey || config.fileApiKey);
      await runConsoleLogin(resolveConsoleOrigin(), {
        needApiKey: !hasApiKey,
        onApiKey: (key) =>
          validateKeyAndPersist(
            config,
            key,
            "standard-api-key",
            config.codingPlanRegion,
            config.tokenPlanRegion,
          ),
      });
      return;
    }

    const hasFlags = !!(
      flags.mode ||
      flags.apiKey ||
      flags.codingPlanApiKey ||
      flags.tokenPlanApiKey ||
      flags.codingPlanRegion ||
      flags.tokenPlanRegion
    );

    let mode: AuthMode;
    let key: string | undefined;
    let codingPlanRegion: CodingPlanRegion;
    let tokenPlanRegion: TokenPlanRegion;

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
      } else if (hasFlags) {
        process.stderr.write(`Warning: DASHSCOPE_API_KEY is already set in environment.\n`);
      }
    }

    if (!hasFlags && isInteractive({ nonInteractive: config.nonInteractive })) {
      const result = await interactiveAuthSetup(config);
      mode = result.mode;
      key = result.key;
      codingPlanRegion = result.codingPlanRegion ?? config.codingPlanRegion;
      tokenPlanRegion = result.tokenPlanRegion ?? config.tokenPlanRegion;
    } else {
      const explicitMode = flags.mode as string | undefined;
      mode = resolveLoginMode(explicitMode, flags);
      key =
        (flags.apiKey as string | undefined) ||
        (flags.codingPlanApiKey as string | undefined) ||
        (flags.tokenPlanApiKey as string | undefined) ||
        (mode === "standard-api-key" ? config.apiKey : undefined);
      codingPlanRegion = resolveCodingPlanRegion(flags, config);
      tokenPlanRegion = resolveTokenPlanRegion(flags, config);
    }

    if (!key) {
      if (!hasFlags) {
        printCurrentCommandHelp(process.stderr);
        process.exit(0);
      }
      throw new BailianError(
        "--api-key is required.",
        ExitCode.USAGE,
        "bl auth login --mode <mode> --api-key <key>",
      );
    }

    if (mode === "coding-plan" && !key.startsWith("sk-sp-")) {
      throw new BailianError(
        'Invalid API key. Coding Plan API keys start with "sk-sp-".',
        ExitCode.USAGE,
      );
    }

    if (!config.dryRun) {
      await validateKeyAndPersist(config, key, mode, codingPlanRegion, tokenPlanRegion);
      printQuickStart();
    } else {
      emitBare(`Would validate and save ${mode} API key.`);
    }
  },
});

function resolveLoginMode(explicitMode: string | undefined, flags: GlobalFlags): AuthMode {
  if (explicitMode) {
    if (!AUTH_MODES.has(explicitMode)) {
      throw new BailianError(
        `Invalid auth mode "${explicitMode}".`,
        ExitCode.USAGE,
        "Valid modes: standard-api-key, coding-plan, token-plan",
      );
    }
    return explicitMode as AuthMode;
  }
  if (flags.codingPlanApiKey) return "coding-plan";
  if (flags.tokenPlanApiKey) return "token-plan";
  return "standard-api-key";
}

function resolveCodingPlanRegion(flags: GlobalFlags, config: Config): CodingPlanRegion {
  const region = (flags.codingPlanRegion as string | undefined) || config.codingPlanRegion;
  if (!CODING_PLAN_REGIONS.has(region)) {
    throw new BailianError(
      `Invalid Coding Plan region "${region}".`,
      ExitCode.USAGE,
      "Valid Coding Plan regions: cn, intl",
    );
  }
  return region as CodingPlanRegion;
}

function resolveTokenPlanRegion(flags: GlobalFlags, config: Config): TokenPlanRegion {
  const region = (flags.tokenPlanRegion as string | undefined) || config.tokenPlanRegion;
  if (!TOKEN_PLAN_REGIONS.has(region)) {
    throw new BailianError(
      `Invalid Token Plan region "${region}".`,
      ExitCode.USAGE,
      "Valid Token Plan regions: cn, intl",
    );
  }
  return region as TokenPlanRegion;
}
