import {
  defineCommand,
  readConfigFile as loadConfigFile,
  getConfigPath,
  detectOutputFormat,
  maskToken,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: "Display current configuration",
  auth: "none",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { config } = ctx;
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

    emitResult(result, format);
  },
});
