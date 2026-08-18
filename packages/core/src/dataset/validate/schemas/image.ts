/**
 * Image generation record schema — Wan2.x fine-tuning.
 *
 * Two record flavours share the same schema:
 *   - **Text-to-image (T2I):** `{"prompt": "...", "img_path": "./x.png"}`
 *   - **Image-to-image (I2I):** `{"prompt": "...", "input_img": "./in.jpg", "img_path": "./out.jpg"}`
 *
 * The presence of `img_path` is the distinguishing field — auto-detect picks
 * this schema before the ChatML fallback. `input_img` is optional (I2I only).
 *
 * Image data lives in a ZIP with a flat layout (no `train/` subdirectory).
 * File names must be ASCII-only per platform requirements.
 */
import { makeIssue } from "../common.ts";
import type { ValidationIssue } from "../types.ts";
import type { RecordSchemaSpec } from "./types.ts";

/** Accepted image file extensions (lower-case, with dot). */
export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".bmp",
  ".tif",
  ".tiff",
  ".webp",
]);

/**
 * Check that a path string ends with an accepted image extension.
 * Returns the extension (lower-case) or an empty string.
 */
function imageExt(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

/**
 * Warn (non-error) when a filename contains non-ASCII characters.
 * The platform requires English-only filenames.
 */
function asciiOnly(value: string): boolean {
  return /^[\x20-\x7E]+$/.test(value);
}

function inspectImageRecord(record: Record<string, unknown>, lineNo: number): ValidationIssue[] {
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

  // --- img_path (required) ---
  if (!("img_path" in record)) {
    out.push(
      makeIssue("error", "MISSING_IMG_PATH", `Required field "img_path" is missing.`, {
        line: lineNo,
        path: "img_path",
      }),
    );
  } else {
    const imgPath = record.img_path;
    if (typeof imgPath !== "string") {
      out.push(
        makeIssue(
          "error",
          "INVALID_IMG_PATH",
          `"img_path" must be a string (got ${typeof imgPath}).`,
          { line: lineNo, path: "img_path" },
        ),
      );
    } else if (imgPath.trim().length === 0) {
      out.push(
        makeIssue("error", "EMPTY_IMG_PATH", `"img_path" must not be empty.`, {
          line: lineNo,
          path: "img_path",
        }),
      );
    } else {
      const ext = imageExt(imgPath);
      if (!IMAGE_EXTENSIONS.has(ext)) {
        out.push(
          makeIssue(
            "warning",
            "UNUSUAL_IMAGE_EXT",
            `"img_path" points to a non-standard image extension "${ext || "(none)"}". ` +
              `Expected one of: ${[...IMAGE_EXTENSIONS].join(", ")}.`,
            { line: lineNo, path: "img_path" },
          ),
        );
      }
      if (!asciiOnly(imgPath)) {
        out.push(
          makeIssue(
            "error",
            "NON_ASCII_IMG_PATH",
            `"img_path" must contain only ASCII characters (English filenames required). Got: "${imgPath}".`,
            { line: lineNo, path: "img_path" },
          ),
        );
      }
    }
  }

  // --- input_img (optional — present only for I2I records) ---
  if ("input_img" in record) {
    const inputImg = record.input_img;
    if (typeof inputImg !== "string") {
      out.push(
        makeIssue(
          "error",
          "INVALID_INPUT_IMG",
          `"input_img" must be a string (got ${typeof inputImg}).`,
          { line: lineNo, path: "input_img" },
        ),
      );
    } else if (inputImg.trim().length === 0) {
      out.push(
        makeIssue("error", "EMPTY_INPUT_IMG", `"input_img" must not be empty.`, {
          line: lineNo,
          path: "input_img",
        }),
      );
    } else {
      const ext = imageExt(inputImg);
      if (!IMAGE_EXTENSIONS.has(ext)) {
        out.push(
          makeIssue(
            "warning",
            "UNUSUAL_INPUT_IMG_EXT",
            `"input_img" points to a non-standard image extension "${ext || "(none)"}". ` +
              `Expected one of: ${[...IMAGE_EXTENSIONS].join(", ")}.`,
            { line: lineNo, path: "input_img" },
          ),
        );
      }
      if (!asciiOnly(inputImg)) {
        out.push(
          makeIssue(
            "error",
            "NON_ASCII_INPUT_IMG",
            `"input_img" must contain only ASCII characters (English filenames required). Got: "${inputImg}".`,
            { line: lineNo, path: "input_img" },
          ),
        );
      }
    }
  }

  return out;
}

/**
 * Image generation schema. Auto-detect: a record matches when it carries
 * `img_path`. Placed before ChatML in the registry so image data is never
 * misclassified.
 */
export const imageSchema: RecordSchemaSpec = {
  name: "image",
  detect: (record) => "img_path" in record,
  inspect: inspectImageRecord,
};
