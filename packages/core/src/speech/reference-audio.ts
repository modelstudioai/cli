import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

/** Bytes of standard Base64 (no newlines) for a raw payload of this size. */
export function estimatedBase64ByteLength(rawBytes: number): number {
  return Math.ceil(rawBytes / 3) * 4;
}

/** CosyVoice / Qwen-Audio enrollment and speech generate: official file-size ceiling. */
export const MAX_REFERENCE_AUDIO_RAW_BYTES = 10 * 1024 * 1024;

/**
 * Omni voice enrollment: official ceiling on the Base64-encoded payload.
 * Do not apply this to CosyVoice / Qwen-Audio or speech generate.
 */
export const MAX_REFERENCE_AUDIO_BASE64_BYTES = 10 * 1024 * 1024;

export const REFERENCE_AUDIO_BASE64_LIMIT_HINT =
  "Compress the audio or pass a public http(s) URL. Omni enrollment limits the Base64 payload, not the raw file size.";

/** Reject a raw file (or decoded Data URI body) that exceeds {@link MAX_REFERENCE_AUDIO_RAW_BYTES}. */
export function assertReferenceAudioRawWithinLimit(rawBytes: number, label: string): void {
  if (rawBytes > MAX_REFERENCE_AUDIO_RAW_BYTES) {
    throw new BailianError(`Reference audio exceeds 10 MB: ${label}`, ExitCode.USAGE);
  }
}

/** Reject a Base64 payload that would exceed {@link MAX_REFERENCE_AUDIO_BASE64_BYTES}. */
export function assertReferenceAudioBase64WithinLimit(base64Bytes: number, label: string): void {
  if (base64Bytes > MAX_REFERENCE_AUDIO_BASE64_BYTES) {
    throw new BailianError(
      `Reference audio Base64 payload exceeds 10 MB (${label}).`,
      ExitCode.USAGE,
      REFERENCE_AUDIO_BASE64_LIMIT_HINT,
    );
  }
}
