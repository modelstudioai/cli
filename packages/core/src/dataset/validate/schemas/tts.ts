/**
 * TTS record schema — `{"wav_fn": "train/xxx.wav", "text": "..."}`.
 *
 * Used for audio fine-tuning (e.g. CosyVoice v3 Flash). Each JSONL record
 * inside the training data ZIP's `data.jsonl` maps a `.wav` file path to its
 * transcript. The ZIP validator (`../zip.ts`) calls into this schema via the
 * standard `jsonlValidator` pipeline — the schema only owns per-record checks,
 * the ZIP-level structural validation is separate.
 *
 * Auto-detect: a record matches when it carries `wav_fn` — this is unique to
 * audio training data and will never collide with ChatML/DPO/CPT.
 */
import { makeIssue } from "../common.ts";
import type { ValidationIssue } from "../types.ts";
import type { RecordSchemaSpec } from "./types.ts";

/** Expected audio file extensions (lower-case, with dot). */
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".flac", ".ogg", ".m4a"]);

function inspectTTSRecord(record: Record<string, unknown>, lineNo: number): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  // --- wav_fn ---
  if (!("wav_fn" in record)) {
    out.push(
      makeIssue("error", "MISSING_WAV_FN", `Required field "wav_fn" is missing.`, {
        line: lineNo,
        path: "wav_fn",
      }),
    );
  } else {
    const wavFn = record.wav_fn;
    if (typeof wavFn !== "string") {
      out.push(
        makeIssue("error", "INVALID_WAV_FN", `"wav_fn" must be a string (got ${typeof wavFn}).`, {
          line: lineNo,
          path: "wav_fn",
        }),
      );
    } else if (wavFn.trim().length === 0) {
      out.push(
        makeIssue("error", "EMPTY_WAV_FN", `"wav_fn" must not be empty.`, {
          line: lineNo,
          path: "wav_fn",
        }),
      );
    } else {
      // Check that the path looks like it references an audio file.
      const dotIndex = wavFn.lastIndexOf(".");
      const ext = dotIndex >= 0 ? wavFn.slice(dotIndex).toLowerCase() : "";
      if (!AUDIO_EXTENSIONS.has(ext)) {
        out.push(
          makeIssue(
            "warning",
            "UNUSUAL_AUDIO_EXT",
            `"wav_fn" points to a non-standard audio extension "${ext || "(none)"}". ` +
              `Expected one of: ${[...AUDIO_EXTENSIONS].join(", ")}.`,
            { line: lineNo, path: "wav_fn" },
          ),
        );
      }
    }
  }

  // --- text ---
  if (!("text" in record)) {
    out.push(
      makeIssue("error", "MISSING_TEXT", `Required field "text" is missing.`, {
        line: lineNo,
        path: "text",
      }),
    );
  } else {
    const text = record.text;
    if (typeof text !== "string") {
      out.push(
        makeIssue("error", "INVALID_TEXT", `"text" must be a string (got ${typeof text}).`, {
          line: lineNo,
          path: "text",
        }),
      );
    } else if (text.trim().length === 0) {
      out.push(
        makeIssue("error", "EMPTY_TEXT", `"text" must not be empty / whitespace-only.`, {
          line: lineNo,
          path: "text",
        }),
      );
    }
  }

  return out;
}

/**
 * TTS schema. Auto-detect: a record is treated as TTS when it carries `wav_fn`.
 * Placed first in the registry so audio data is never misclassified as ChatML.
 */
export const ttsSchema: RecordSchemaSpec = {
  name: "tts",
  detect: (record) => "wav_fn" in record,
  inspect: inspectTTSRecord,
};
