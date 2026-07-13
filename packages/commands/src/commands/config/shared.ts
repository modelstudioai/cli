import { BailianError, ExitCode } from "bailian-cli-core";

/** Config keys that `config set` / `config ui` accept for read/write. */
export const VALID_KEYS = [
  "base_url",
  "output",
  "output_dir",
  "timeout",
  "api_key",
  "access_token",
  "access_key_id",
  "access_key_secret",
  "security_token",
  "default_text_model",
  "default_video_model",
  "default_image_model",
  "default_speech_model",
  "default_omni_model",
  "workspace_id",
] as const;

// Keys whose values are secrets. `config set` / `config show` mask these; the
// web UI renders them as password fields (values are still sent in cleartext
// over the token-gated localhost socket).
export const SECRET_KEYS = new Set<string>([
  "api_key",
  "access_token",
  "access_key_id",
  "access_key_secret",
  "security_token",
]);

// Allow hyphen-style keys (e.g. default-text-model → default_text_model).
export const KEY_ALIASES: Record<string, string> = {
  "base-url": "base_url",
  "output-dir": "output_dir",
  "api-key": "api_key",
  "access-token": "access_token",
  "access-key-id": "access_key_id",
  "access-key-secret": "access_key_secret",
  "security-token": "security_token",
  "default-text-model": "default_text_model",
  "default-video-model": "default_video_model",
  "default-image-model": "default_image_model",
  "default-speech-model": "default_speech_model",
  "default-omni-model": "default_omni_model",
  "workspace-id": "workspace_id",
};

/** Resolve a hyphen alias to its underscore config key. */
export function resolveKey(key: string): string {
  return KEY_ALIASES[key] || key;
}

/**
 * Validate a single config entry and coerce its value to the stored type.
 * Throws BailianError(USAGE) for unknown keys or invalid values.
 */
export function validateAndCoerce(key: string, value: string): string | number {
  const resolvedKey = resolveKey(key);

  if (!(VALID_KEYS as readonly string[]).includes(resolvedKey)) {
    throw new BailianError(
      `Invalid config key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`,
      ExitCode.USAGE,
    );
  }

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
    return num;
  }

  return value;
}
