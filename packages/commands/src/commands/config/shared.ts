import {
  BailianError,
  ExitCode,
  normalizeModelBaseUrl,
  SUPPORTED_LANGUAGES,
} from "bailian-cli-core";

/** Config keys that `config set` / `config ui` accept for read/write. */
export const VALID_KEYS = [
  "language",
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
  "default_image_to_video_model",
  "default_reference_to_video_model",
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

// The web UI edits the full ConfigFile, so it exposes these extra keys on top
// of VALID_KEYS (which `config set` keeps as its narrower, documented surface).
// This lets `config ui` surface and edit every field that lives in config.json
// rather than silently hiding console/telemetry settings.
export const UI_EXTRA_KEYS = [
  "console_site",
  "console_region",
  "console_switch_agent",
  "telemetry",
] as const;

export const UI_VALID_KEYS = [...VALID_KEYS, ...UI_EXTRA_KEYS] as const;

// Keys the UI renders as a fixed-choice dropdown instead of a free-text input.
export const UI_ENUM_KEYS: Record<string, string[]> = {
  language: [...SUPPORTED_LANGUAGES],
  output: ["text", "json"],
  console_site: ["domestic", "international"],
};

// Keys the UI renders as a true/false dropdown and stores as a boolean.
export const UI_BOOLEAN_KEYS = new Set<string>(["telemetry"]);

// Default model each `default_*_model` key falls back to when left unset. These
// mirror the inline `|| "<model>"` fallbacks in the generation commands
// (text/chat, image/generate, video/generate, speech/synthesize, omni/chat) and
// are surfaced as input placeholders so users can see the effective default
// without persisting a value that would pin the model.
export const UI_MODEL_DEFAULTS: Record<string, string> = {
  default_text_model: "qwen3.8-max",
  default_image_model: "qwen-image-3.0",
  default_video_model: "happyhorse-1.1-t2v",
  default_speech_model: "cosyvoice-v3-flash",
  default_omni_model: "qwen3.5-omni-plus",
};

/** One selectable model plus a short note on where the CLI uses it. */
export interface ModelOption {
  id: string;
  role: string;
}

// A per-category catalog of the model names the `bl` pipeline actually
// references (packages/runtime/src/pipeline/steps/bl-api.ts, plus the advisor
// and agent-writer helpers). The UI groups these under each `default_*_model`
// field as click-to-fill suggestions; the first entry is the fallback default.
// Only names present in the codebase are listed here — no invented models.
export const UI_MODEL_CATALOG: Record<string, ModelOption[]> = {
  default_text_model: [
    { id: "qwen3.8-max", role: "text/chat default" },
    { id: "qwen3-coder-plus", role: "coding-oriented (agent config)" },
    { id: "qwen-flash", role: "fast · advisor ranking" },
    { id: "qwen3.6-flash", role: "fast · advisor intent" },
  ],
  default_image_model: [
    { id: "qwen-image-3.0", role: "image/generate default · sync" },
    { id: "qwen-image-2.0", role: "image/generate · sync" },
    { id: "qwen-image-max", role: "image/generate · sync" },
    { id: "qwen-image-edit-2.0", role: "image/edit · sync" },
    { id: "wanx2.x", role: "image/generate · async series" },
  ],
  default_video_model: [
    { id: "happyhorse-1.1-t2v", role: "video/generate default · text-to-video" },
    { id: "happyhorse-1.1-i2v", role: "video/generate · image-to-video" },
  ],
  default_speech_model: [
    { id: "cosyvoice-v3-flash", role: "speech/synthesize (TTS) default" },
    { id: "fun-asr", role: "speech/recognize (ASR)" },
  ],
  default_omni_model: [
    { id: "qwen3.5-omni-plus", role: "omni/chat default" },
    { id: "qwen3-vl-plus", role: "vision/describe · multimodal input" },
  ],
};

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
  "default-image-to-video-model": "default_image_to_video_model",
  "default-reference-to-video-model": "default_reference_to_video_model",
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

  if (resolvedKey === "language" && !(SUPPORTED_LANGUAGES as readonly string[]).includes(value)) {
    throw new BailianError(
      `Invalid language "${value}". Valid values: ${SUPPORTED_LANGUAGES.join(", ")}`,
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

  if (resolvedKey === "base_url") return normalizeModelBaseUrl(value);

  return value;
}

/**
 * Validate/coerce a value for the wider set of keys the web UI can edit
 * (UI_VALID_KEYS). Standard keys delegate to `validateAndCoerce`; the UI-only
 * extras (console_*, telemetry) are validated here. Booleans are returned as
 * real booleans so they persist correctly in config.json.
 */
export function validateAndCoerceUi(key: string, value: string): string | number | boolean {
  const resolvedKey = resolveKey(key);

  if ((VALID_KEYS as readonly string[]).includes(resolvedKey)) {
    return validateAndCoerce(key, value);
  }

  if (resolvedKey === "console_site") {
    if (!["domestic", "international"].includes(value)) {
      throw new BailianError(
        `Invalid console_site "${value}". Valid values: domestic, international`,
        ExitCode.USAGE,
      );
    }
    return value;
  }

  if (resolvedKey === "console_region") return value;

  if (resolvedKey === "console_switch_agent") {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      throw new BailianError(
        `Invalid console_switch_agent "${value}". Must be a positive number.`,
        ExitCode.USAGE,
      );
    }
    return num;
  }

  if (resolvedKey === "telemetry") {
    if (value !== "true" && value !== "false") {
      throw new BailianError(
        `Invalid telemetry "${value}". Valid values: true, false`,
        ExitCode.USAGE,
      );
    }
    return value === "true";
  }

  throw new BailianError(
    `Invalid config key "${key}". Valid keys: ${UI_VALID_KEYS.join(", ")}`,
    ExitCode.USAGE,
  );
}
