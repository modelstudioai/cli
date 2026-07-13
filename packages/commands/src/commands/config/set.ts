import { defineCommand, detectOutputFormat, maskToken, type ConfigFile } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { SECRET_KEYS, resolveKey, validateAndCoerce } from "./shared.ts";

export default defineCommand({
  description: "Set a config value",
  auth: "none",
  usageArgs: "--key <key> --value <value>",
  flags: {
    key: {
      type: "string",
      valueHint: "<key>",
      description:
        "Config key (base_url, output, output_dir, timeout, api_key, access_token, access_key_id, access_key_secret, security_token, default_*_model, workspace_id)",
      required: true,
    },
    value: { type: "string", valueHint: "<value>", description: "Value to set", required: true },
  },
  exampleArgs: [
    "--key output --value json",
    "--key timeout --value 600",
    "--key base_url --value https://dashscope.aliyuncs.com",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const key = flags.key;
    const value = flags.value;

    // Resolve hyphen aliases to underscore keys and validate/coerce the value.
    const resolvedKey: string = resolveKey(key);
    const coerced = validateAndCoerce(key, value);

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          would_set: { [resolvedKey]: value },
          config: settings.configName ?? "default",
          config_file: ctx.configStore().path,
        },
        format,
      );
      return;
    }

    await ctx.configStore().write({ [resolvedKey]: coerced } as Partial<ConfigFile>);

    if (!settings.quiet) {
      const shown = SECRET_KEYS.has(resolvedKey) ? maskToken(String(coerced)) : coerced;
      emitResult(
        {
          [resolvedKey]: shown,
          config: settings.configName ?? "default",
          config_file: ctx.configStore().path,
        },
        format,
      );
    }
  },
});
