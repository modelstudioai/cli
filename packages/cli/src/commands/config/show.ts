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
      active_auth_mode: config.activeAuthMode,
    };

    // Mask API key if present
    if (file.api_key) {
      result.api_key = maskToken(file.api_key);
    }
    if (file.access_token) {
      result.access_token = maskToken(file.access_token);
    }

    // Plan-related fields
    if (file.coding_plan_api_key) {
      result.coding_plan_api_key = maskToken(file.coding_plan_api_key);
    }
    if (file.coding_plan_region) {
      result.coding_plan_region = file.coding_plan_region;
    }
    if (file.token_plan_api_key) {
      result.token_plan_api_key = maskToken(file.token_plan_api_key);
    }
    if (file.token_plan_region) {
      result.token_plan_region = file.token_plan_region;
    }

    // Default models
    if (file.default_text_model) result.default_text_model = file.default_text_model;
    if (file.default_video_model) result.default_video_model = file.default_video_model;
    if (file.default_image_model) result.default_image_model = file.default_image_model;

    emitResult(result, format);
  },
});
