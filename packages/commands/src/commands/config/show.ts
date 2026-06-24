import {
  defineCommand,
  readConfigFile as loadConfigFile,
  getConfigPath,
  detectOutputFormat,
  maskToken,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: "Display current configuration",
  skipDefaultApiKeySetup: true,
  exampleArgs: ["", "--output json"],
  async run(config: Config, _flags: GlobalFlags) {
    const file = loadConfigFile();
    const format = detectOutputFormat(config.output);

    const result: Record<string, unknown> = {
      ...file,
      base_url: config.baseUrl,
      output: config.output,
      timeout: config.timeout,
      config_file: getConfigPath(),
    };

    if (typeof result.api_key === "string") result.api_key = maskToken(result.api_key);
    if (typeof result.access_token === "string")
      result.access_token = maskToken(result.access_token);
    if (typeof result.access_key_id === "string")
      result.access_key_id = maskToken(result.access_key_id);
    if (typeof result.access_key_secret === "string") {
      result.access_key_secret = maskToken(result.access_key_secret);
    }

    emitResult(result, format);
  },
});
