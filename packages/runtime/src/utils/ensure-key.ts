import {
  BailianError,
  ExitCode,
  isInteractive,
  maskToken,
  readConfigFile,
  writeConfigFile,
  type Config,
} from "bailian-cli-core";
import { promptText, promptConfirm } from "../output/prompt.ts";

export async function ensureApiKey(config: Config): Promise<void> {
  if (config.apiKey || config.fileApiKey || config.accessTokenEnv || config.fileAccessToken) return;

  const envKey = process.env.DASHSCOPE_API_KEY;
  let key: string | undefined;

  if (envKey) {
    if (!isInteractive({ nonInteractive: config.nonInteractive })) {
      key = envKey;
    } else {
      const use = await promptConfirm({
        message: `Found DASHSCOPE_API_KEY in environment (${maskToken(envKey)}). Save it to config file?`,
      });
      if (use) key = envKey;
    }
  }

  if (!key) {
    if (!isInteractive({ nonInteractive: config.nonInteractive })) {
      throw new BailianError(
        "No API key found.",
        ExitCode.AUTH,
        "Set DASHSCOPE_API_KEY environment variable, pass --api-key, or run interactively to be prompted.",
      );
    }
    const input = await promptText({ message: "Enter your DashScope API key:" });
    if (!input) throw new BailianError("API key is required.", ExitCode.AUTH);
    key = input;
  }

  const data: Record<string, unknown> = {
    ...(readConfigFile() as Record<string, unknown>),
    api_key: key,
  };
  await writeConfigFile(data);
  config.fileApiKey = key;

  const path = config.configPath ?? "~/.bailian/config.json";
  process.stderr.write(`API key saved to ${path}\n`);
}
