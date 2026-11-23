import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

/** Bytes of standard Base64 (no newlines) for a raw payload of this size. */
export function estimatedBase64ByteLength(rawBytes: number): number {
  return Math.ceil(rawBytes / 3) * 4;
}

/**
 * Local ceiling for reference audio sent as Base64.
 * Voice enrollment documents this encoded-payload limit.
 * Speech generate reuses it as an estimate; that API's raw-vs-encoded rule is not documented here.
 */
export const MAX_REFERENCE_AUDIO_BASE64_BYTES = 10 * 1024 * 1024;

export const REFERENCE_AUDIO_BASE64_LIMIT_HINT =
  "Compress the audio or pass a public http(s) URL. The check estimates the Base64 payload, not the raw file size.";

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
