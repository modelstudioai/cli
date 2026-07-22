import { defineCommand, detectOutputFormat, maskToken } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { SECRET_KEYS } from "./shared.ts";

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

    for (const key of SECRET_KEYS) {
      if (typeof result[key] === "string") result[key] = maskToken(result[key]);
    }

    emitResult(result, format);
  },
});
