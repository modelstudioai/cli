import {
  BailianError,
  ExitCode,
  isInteractive,
  maskToken,
  readConfigFile,
  resolveCredential,
  writeConfigFile,
  type Config,
} from "bailian-cli-core";
import { promptConfirm } from "../output/prompt.ts";
import { interactiveAuthSetup } from "./auth-wizard.ts";

export async function ensureApiKey(config: Config): Promise<void> {
  try {
    await resolveCredential(config);
    return;
  } catch {
    // No valid credential — need setup
  }

  if (!isInteractive({ nonInteractive: config.nonInteractive })) {
    throw new BailianError(
      `No credentials found for active auth mode "${config.activeAuthMode}".`,
      ExitCode.AUTH,
      "Set the matching environment variable, pass --api-key, or run interactively to be guided.\n" +
        `  bl auth login --mode ${config.activeAuthMode} --api-key <your-key>`,
    );
  }

  const envKey = process.env.DASHSCOPE_API_KEY;
  if (envKey && config.activeAuthMode === "standard-api-key") {
    const use = await promptConfirm({
      message: `Found DASHSCOPE_API_KEY in environment (${maskToken(envKey)}). Save it to config file?`,
    });
    if (use) {
      const data = {
        ...(readConfigFile() as Record<string, unknown>),
        active_auth_mode: "standard-api-key",
        api_key: envKey,
      };
      await writeConfigFile(data);
      config.fileApiKey = envKey;
      config.activeAuthMode = "standard-api-key";
      const path = config.configPath ?? "~/.bailian/config.json";
      process.stderr.write(`API key saved to ${path}\n`);
      return;
    }
  }

  const result = await interactiveAuthSetup(config);

  const data = readConfigFile() as Record<string, unknown>;
  data.active_auth_mode = result.mode;
  if (result.mode === "standard-api-key") data.api_key = result.key;
  if (result.mode === "coding-plan") {
    data.coding_plan_api_key = result.key;
    if (result.codingPlanRegion) data.coding_plan_region = result.codingPlanRegion;
  }
  if (result.mode === "token-plan") data.token_plan_api_key = result.key;
  await writeConfigFile(data);

  config.activeAuthMode = result.mode;
  config.fileApiKey = result.mode === "standard-api-key" ? result.key : undefined;
  config.codingPlanApiKey = result.mode === "coding-plan" ? result.key : undefined;
  config.tokenPlanApiKey = result.mode === "token-plan" ? result.key : undefined;
  if (result.codingPlanRegion) config.codingPlanRegion = result.codingPlanRegion;

  const path = config.configPath ?? "~/.bailian/config.json";
  process.stderr.write(`API key saved to ${path}\n`);
}
