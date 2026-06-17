import {
  defineCommand,
  readConfigFile as loadConfigFile,
  getConfigPath,
  detectOutputFormat,
  maskToken,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult } from "../../output/output.ts";

export default defineCommand({
  name: "config show",
  description: "Display current configuration",
  skipDefaultApiKeySetup: true,
  usage: "bl config show",
  examples: ["bl config show", "bl config show --output json"],
  async run(config: Config, _flags: GlobalFlags) {
    const file = loadConfigFile();
    const format = detectOutputFormat(config.output);

    const result: Record<string, unknown> = {
      region: config.region,
      base_url: config.baseUrl,
      output: config.output,
      timeout: config.timeout,
      config_file: getConfigPath(),
    };

    // Mask API key if present
    if (file.api_key) {
      result.api_key = maskToken(file.api_key);
    }
    if (file.access_token) {
      result.access_token = maskToken(file.access_token);
    }

    // Default models
    if (file.default_text_model) result.default_text_model = file.default_text_model;
    if (file.default_video_model) result.default_video_model = file.default_video_model;
    if (file.default_image_model) result.default_image_model = file.default_image_model;

    emitResult(result, format);
  },
});
