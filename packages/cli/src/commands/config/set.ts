import {
  defineCommand,
  detectOutputFormat,
  maskToken,
  readConfigFile,
  writeConfigFile,
  BailianError,
  type Config,
  type GlobalFlags,
  ExitCode,
} from "bailian-cli-core";
import { emitResult } from "../../output/output.ts";

const VALID_KEYS = [
  "base_url",
  "output",
  "output_dir",
  "timeout",
  "api_key",
  "access_token",
  "default_text_model",
  "default_video_model",
  "default_image_model",
  "default_speech_model",
  "default_omni_model",
  "access_key_id",
  "access_key_secret",
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
  "default-text-model": "default_text_model",
  "default-video-model": "default_video_model",
  "default-image-model": "default_image_model",
  "default-speech-model": "default_speech_model",
  "default-omni-model": "default_omni_model",
  "access-key-id": "access_key_id",
  "access-key-secret": "access_key_secret",
  "workspace-id": "workspace_id",
};

export default defineCommand({
  name: "config set",
  description: "Set a config value",
  usage: "bl config set --key <key> --value <value>",
  options: [
    {
      flag: "--key <key>",
      description:
        "Config key (base_url, output, output_dir, timeout, api_key, access_token, default_*_model, access_key_id, access_key_secret, workspace_id)",
    },
    { flag: "--value <value>", description: "Value to set" },
  ],
  examples: [
    "bl config set --key output --value json",
    "bl config set --key timeout --value 600",
    "bl config set --key base_url --value https://dashscope.aliyuncs.com",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const key = flags.key as string | undefined;
    const value = flags.value as string | undefined;

    if (!key || value === undefined) {
      throw new BailianError(
        "--key and --value are required.",
        ExitCode.USAGE,
        "bl config set --key <key> --value <value>",
      );
    }

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

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ would_set: { [resolvedKey]: value } }, format);
      return;
    }

    const existing = readConfigFile() as Record<string, unknown>;
    existing[resolvedKey] = resolvedKey === "timeout" ? Number(value) : value;
    await writeConfigFile(existing);

    if (!config.quiet) {
      const shown = SECRET_KEYS.has(resolvedKey)
        ? maskToken(String(existing[resolvedKey]))
        : existing[resolvedKey];
      emitResult({ [resolvedKey]: shown }, format);
    }
  },
});
