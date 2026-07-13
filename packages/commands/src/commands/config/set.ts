import {
  defineCommand,
  detectOutputFormat,
  maskToken,
  BailianError,
  ExitCode,
  type ConfigFile,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const VALID_KEYS = [
  "base_url",
  "output",
  "output_dir",
  "timeout",
  "api_key",
  "access_token",
  "access_key_id",
  "access_key_secret",
  "default_text_model",
  "default_video_model",
  "default_image_model",
  "default_speech_model",
  "default_omni_model",
  "workspace_id",
];

// Keys whose values are secrets. Their stored value must never be echoed back in
// cleartext (CI logs, pipes, shared terminals); show a masked form instead — the
// same policy `config show` and `auth status` already follow.
const SECRET_KEYS = new Set(["api_key", "access_token", "access_key_id", "access_key_secret"]);

// Allow hyphen-style keys (e.g. default-text-model → default_text_model)
const KEY_ALIASES: Record<string, string> = {
  "base-url": "base_url",
  "output-dir": "output_dir",
  "api-key": "api_key",
  "access-token": "access_token",
  "access-key-id": "access_key_id",
  "access-key-secret": "access_key_secret",
  "default-text-model": "default_text_model",
  "default-video-model": "default_video_model",
  "default-image-model": "default_image_model",
  "default-speech-model": "default_speech_model",
  "default-omni-model": "default_omni_model",
  "workspace-id": "workspace_id",
};

export default defineCommand({
  description: "Set a config value",
  auth: "none",
  usageArgs: "--key <key> --value <value>",
  flags: {
    key: {
      type: "string",
      valueHint: "<key>",
      description:
        "Config key (base_url, output, output_dir, timeout, api_key, access_token, access_key_id, access_key_secret, default_*_model, workspace_id)",
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

    // Resolve hyphen aliases to underscore keys
    const resolvedKey: string = KEY_ALIASES[key] || key;

    if (!VALID_KEYS.includes(resolvedKey)) {
      throw new BailianError(
        `Invalid config key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`,
        ExitCode.USAGE,
      );
    }

    // Validate specific values
    if (resolvedKey === "output" && !["text", "json"].includes(value)) {
      throw new BailianError(
        `Invalid output format "${value}". Valid values: text, json`,
        ExitCode.USAGE,
      );
    }

    if (resolvedKey === "timeout") {
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        throw new BailianError(
          `Invalid timeout "${value}". Must be a positive number.`,
          ExitCode.USAGE,
        );
      }
    }

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ would_set: { [resolvedKey]: value } }, format);
      return;
    }

    const coerced = resolvedKey === "timeout" ? Number(value) : value;
    await ctx.configStore.write({ [resolvedKey]: coerced } as Partial<ConfigFile>);

    if (!settings.quiet) {
      const shown = SECRET_KEYS.has(resolvedKey) ? maskToken(String(coerced)) : coerced;
      emitResult({ [resolvedKey]: shown }, format);
    }
  },
});
