import { existsSync, statSync } from "fs";
import { extname } from "path";
import {
  audioFileToDataUri,
  audioMimeForPath,
  BailianError,
  ExitCode,
  redactDataUri,
  type FlagsDef,
} from "bailian-cli-core";

/** Shared --id flag for get / update / delete / preview. */
export const VOICE_ID_FLAG = {
  id: {
    type: "string",
    valueHint: "<voice-id>",
    description: {
      "en-US": "Voice ID (required)",
      "zh-CN": "音色 ID（必填）",
    },
    required: true,
  },
} satisfies FlagsDef;

/** Shared --prefix flag for clone / design / list. */
export const VOICE_PREFIX_FLAG = {
  prefix: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Custom voice prefix. Digits and letters only, 1-10 characters",
      "zh-CN": "音色自定义前缀。仅允许数字和英文字母，1-10 个字符",
    },
  },
} satisfies FlagsDef;

export const VOICE_RIGHTS_NOTES = [
  {
    "en-US":
      "You must have the right to use the reference audio or described voice. Do not clone or imitate a real person without authorization.",
    "zh-CN": "你必须有权使用参考音频或所描述的音色。未经授权请勿复刻或模仿真实个人声音。",
  },
  {
    "en-US":
      "A voice ID is bound to its target model. Later `speech synthesize` calls must use the same --model.",
    "zh-CN": "音色 ID 绑定目标模型。后续 `speech synthesize` 必须使用相同的 --model。",
  },
] as const;

const PREFIX_PATTERN = /^[A-Za-z0-9]{1,10}$/;

/** Voice clone/update reference audio limit from the enrollment API docs. */
export const MAX_VOICE_REFERENCE_BYTES = 10 * 1024 * 1024;

/** Validate voice ID is non-empty after trim. */
export function validateVoiceId(voiceId: string | undefined): string | undefined {
  if (voiceId === undefined) return undefined;
  if (voiceId.trim().length === 0) {
    return "--id must not be empty.";
  }
  return undefined;
}

/** Validate prefix: digits and letters, 1-10 chars. */
export function validateVoicePrefix(prefix: string | undefined): string | undefined {
  if (prefix === undefined) return undefined;
  if (prefix.length === 0) {
    return "--prefix must not be empty.";
  }
  if (!PREFIX_PATTERN.test(prefix)) {
    return "--prefix must be 1-10 characters of digits or letters (A-Z, a-z, 0-9).";
  }
  return undefined;
}

/** Validate 1-based page / page-size positive integers. */
export function validatePositiveIntPage(
  page: number | undefined,
  pageSize: number | undefined,
): string | undefined {
  if (page !== undefined && (!Number.isInteger(page) || page < 1)) {
    return "--page must be an integer >= 1.";
  }
  if (pageSize !== undefined && (!Number.isInteger(pageSize) || pageSize < 1)) {
    return "--page-size must be an integer >= 1.";
  }
  return undefined;
}

/** Validate language hint: at most one item when provided as array. */
export function validateLanguageHints(hints: string[] | undefined): string | undefined {
  if (hints === undefined) return undefined;
  if (hints.length > 1) {
    return "Provide at most one --language-hint.";
  }
  if (hints.length === 1 && hints[0]!.trim().length === 0) {
    return "--language-hint must not be empty.";
  }
  return undefined;
}

/**
 * Resolve a reference audio argument for dry-run or live calls.
 * Local paths become Data URIs (or a pending marker for dry-run);
 * http(s) URLs and existing Data URIs pass through.
 * Format checks run before encode so dry-run and live agree.
 */
export function resolveVoiceAudioSource(
  audio: string,
  options: { encodeLocal: boolean },
): { audio: string; localPath?: string } {
  const trimmed = audio.trim();
  if (trimmed.length === 0) {
    throw new BailianError("--audio must not be empty.", ExitCode.USAGE);
  }
  if (/^data:/i.test(trimmed)) {
    if (!/^data:audio\//i.test(trimmed)) {
      throw new BailianError("Reference Data URI must use an audio/* MIME type.", ExitCode.USAGE);
    }
    if (!/;base64,/i.test(trimmed)) {
      throw new BailianError(
        "Reference Data URI must be base64-encoded (…;base64,…).",
        ExitCode.USAGE,
      );
    }
    return { audio: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { audio: trimmed };
  }
  if (!existsSync(trimmed)) {
    throw new BailianError(`Audio file not found: ${trimmed}`, ExitCode.USAGE);
  }
  const stat = statSync(trimmed);
  if (!stat.isFile()) {
    throw new BailianError(`Not a file: ${trimmed}`, ExitCode.USAGE);
  }
  if (stat.size > MAX_VOICE_REFERENCE_BYTES) {
    throw new BailianError(`Reference audio exceeds 10 MB: ${trimmed}`, ExitCode.USAGE);
  }
  if (!audioMimeForPath(trimmed)) {
    const extension = extname(trimmed).toLowerCase() || "unknown";
    throw new BailianError(
      `Unsupported audio format "${extension}".`,
      ExitCode.USAGE,
      "Use an audio file with a recognized extension.",
    );
  }
  if (!options.encodeLocal) {
    return { audio: trimmed, localPath: trimmed };
  }
  return { audio: audioFileToDataUri(trimmed), localPath: trimmed };
}

/** Redact Data URI payloads in dry-run request bodies. */
export function redactVoiceAudioInRequest(
  request: { input?: Record<string, unknown> },
  localPath?: string,
): { input?: Record<string, unknown> } & Record<string, unknown> {
  const input = request.input ? { ...request.input } : undefined;
  if (input && typeof input.audio === "string") {
    if (localPath && input.audio === localPath) {
      input.audio = `<local-file:${localPath};pending-encode>`;
    } else {
      input.audio = redactDataUri(input.audio);
    }
  }
  return { ...request, input };
}
