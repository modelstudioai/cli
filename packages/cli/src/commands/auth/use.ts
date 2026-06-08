import {
  AUTH_MODES,
  BailianError,
  ExitCode,
  defineCommand,
  readConfigFile,
  writeConfigFile,
  type AuthMode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult } from "../../output/output.ts";

export default defineCommand({
  name: "auth use",
  description: "Switch the active auth mode",
  usage: "bl auth use --mode <mode>",
  options: [
    {
      flag: "--mode <mode>",
      description: "Auth mode: standard-api-key, coding-plan, token-plan",
      required: true,
    },
  ],
  examples: [
    "bl auth use --mode standard-api-key",
    "bl auth use --mode coding-plan",
    "bl auth use --mode token-plan",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const mode = flags.mode as string | undefined;
    if (!mode) {
      throw new BailianError("--mode is required.", ExitCode.USAGE, "bl auth use --mode <mode>");
    }
    if (!AUTH_MODES.has(mode)) {
      throw new BailianError(
        `Invalid auth mode "${mode}".`,
        ExitCode.USAGE,
        "Valid modes: standard-api-key, coding-plan, token-plan",
      );
    }

    const file = readConfigFile() as Record<string, unknown>;
    file.active_auth_mode = mode;

    if (!config.dryRun) {
      await writeConfigFile(file);
    }

    if (!config.dryRun && !hasKeyForMode(mode as AuthMode, file)) {
      process.stderr.write(
        `Warning: No API key configured for "${mode}". Run: bl auth login --mode ${mode} --api-key <your-key>\n`,
      );
    }

    emitResult(
      config.dryRun
        ? { would_set: { active_auth_mode: mode } }
        : { active_auth_mode: mode as AuthMode },
      config.output,
    );
  },
});

function hasKeyForMode(mode: AuthMode, file: Record<string, unknown>): boolean {
  switch (mode) {
    case "standard-api-key":
      return !!(file.api_key || process.env.DASHSCOPE_API_KEY);
    case "coding-plan":
      return !!(file.coding_plan_api_key || process.env.BAILIAN_CODING_PLAN_API_KEY);
    case "token-plan":
      return !!(file.token_plan_api_key || process.env.BAILIAN_TOKEN_PLAN_API_KEY);
  }
}
