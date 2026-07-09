/**
 * Video generation record schema — Wan i2v / kf2v fine-tuning.
 *
 * Two record flavours share the same schema:
 *   - **Image-to-video, first frame (i2v):**
 *       `{"prompt": "...", "first_frame_path": "image_1.jpg", "video_path": "video_1.mp4"}`
 *   - **Image-to-video, first+last frame (kf2v):**
 *       `{"prompt": "...", "first_frame_path": "image/x_first.jpg",
 *         "last_frame_path": "image/x_last.jpg", "video_path": "video/x.mp4"}`
 *
 * The presence of `first_frame_path` / `video_path` is the distinguishing
 * signal — auto-detect picks this schema before the ChatML fallback.
 *
 * `video_path` is OPTIONAL: validation-set records omit the target video (the
 * platform generates preview videos from the first frame + prompt at each eval
 * checkpoint), so the same schema validates both training and validation zips.
 * `last_frame_path` is optional (kf2v only).
 *
 * Video data lives in a ZIP: i2v is flat, kf2v uses `image/` + `video/`
 * subfolders. File names should be ASCII-only per platform requirements.
 */
import { makeIssue } from "../common.ts";
import type { ValidationIssue } from "../types.ts";
import type { RecordSchemaSpec } from "./types.ts";

/** Accepted image (frame) file extensions (lower-case, with dot). */
export const VIDEO_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp"]);

/** Accepted video file extensions (lower-case, with dot). */
export const VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);

/** Return the lower-case extension of a path (with dot), or "". */
function pathExt(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

/** The platform requires English-only (ASCII) file names. */
function asciiOnly(value: string): boolean {
  return /^[\x20-\x7E]+$/.test(value);
}

/**
 * Validate a required string path field, checking its extension against the
 * accepted set and warning on non-ASCII names. Pushes issues into `out`.
 */
function checkPathField(
  out: ValidationIssue[],
  record: Record<string, unknown>,
  field: string,
  required: boolean,
  accepted: Set<string>,
  lineNo: number,
): void {
  if (!(field in record)) {
    if (required) {
      out.push(
        makeIssue("error", "MISSING_FIELD", `Required field "${field}" is missing.`, {
          line: lineNo,
          path: field,
        }),
      );
    }
    return;
  }
  const value = record[field];
  if (typeof value !== "string") {
    out.push(
      makeIssue("error", "INVALID_FIELD", `"${field}" must be a string (got ${typeof value}).`, {
        line: lineNo,
        path: field,
      }),
    );
    return;
  }
  if (value.trim().length === 0) {
    out.push(
      makeIssue("error", "EMPTY_FIELD", `"${field}" must not be empty.`, {
        line: lineNo,
        path: field,
      }),
    );
    return;
  }
  const ext = pathExt(value);
  if (!accepted.has(ext)) {
    out.push(
      makeIssue(
        "warning",
        "UNUSUAL_MEDIA_EXT",
        `"${field}" points to a non-standard extension "${ext || "(none)"}". ` +
          `Expected one of: ${[...accepted].join(", ")}.`,
        { line: lineNo, path: field },
      ),
    );
  }
  if (!asciiOnly(value)) {
    out.push(
      makeIssue(
        "error",
        "NON_ASCII_PATH",
        `"${field}" must contain only ASCII characters (English filenames required). Got: "${value}".`,
        { line: lineNo, path: field },
      ),
    );
  }
}

function inspectVideoRecord(record: Record<string, unknown>, lineNo: number): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  // --- prompt (required) ---
  if (!("prompt" in record)) {
    out.push(
      makeIssue("error", "MISSING_PROMPT", `Required field "prompt" is missing.`, {
        line: lineNo,
        path: "prompt",
      }),
    );
  } else {
    const prompt = record.prompt;
    if (typeof prompt !== "string") {
      out.push(
        makeIssue("error", "INVALID_PROMPT", `"prompt" must be a string (got ${typeof prompt}).`, {
          line: lineNo,
          path: "prompt",
        }),
      );
    } else if (prompt.trim().length === 0) {
      out.push(
        makeIssue("error", "EMPTY_PROMPT", `"prompt" must not be empty / whitespace-only.`, {
          line: lineNo,
          path: "prompt",
        }),
      );
    }
  }

  // --- first_frame_path (required) ---
  checkPathField(out, record, "first_frame_path", true, VIDEO_IMAGE_EXTENSIONS, lineNo);
  // --- last_frame_path (optional — kf2v only) ---
  checkPathField(out, record, "last_frame_path", false, VIDEO_IMAGE_EXTENSIONS, lineNo);
  // --- video_path (optional — training only; validation sets omit it) ---
  checkPathField(out, record, "video_path", false, VIDEO_EXTENSIONS, lineNo);

  return out;
}

/**
 * Video generation schema. Auto-detect: a record matches when it carries
 * `first_frame_path` or `video_path`. Placed before ChatML in the registry so
 * video data is never misclassified. Distinct from image (`img_path`).
 */
export const videoSchema: RecordSchemaSpec = {
  name: "video",
  detect: (record) => "first_frame_path" in record || "video_path" in record,
  inspect: inspectVideoRecord,
};
