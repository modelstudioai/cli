import { defineCommand, detectOutputFormat, maskToken } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: "Display current configuration",
  auth: "none",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings, client } = ctx;
    const store = ctx.configStore;
    const file = store.read();
    const format = detectOutputFormat(settings.output);

    const result: Record<string, unknown> = {
      ...file,
      base_url: client.baseUrl,
      output: settings.output,
      timeout: settings.timeout,
      config: settings.configName ?? "default",
      config_file: store.path,
    };

    if (typeof result.api_key === "string") result.api_key = maskToken(result.api_key);
    if (typeof result.access_token === "string")
      result.access_token = maskToken(result.access_token);
    if (typeof result.access_key_id === "string")
      result.access_key_id = maskToken(result.access_key_id);
    if (typeof result.access_key_secret === "string")
      result.access_key_secret = maskToken(result.access_key_secret);

    emitResult(result, format);
  },
});
