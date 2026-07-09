/**
 * Data inspector — lightweight content parser that determines the modality
 * of a training data file.
 *
 * The inspector peeks at the first non-blank line of a JSONL file (or the
 * `data.jsonl` manifest inside a ZIP) and inspects the record's fields to
 * decide whether the data carries text, audio, image, or video samples.
 *
 * This is intentionally shallow — it reads at most one record — so it stays
 * fast even on very large files. The full structural validation is the job
 * of the format-specific validator (`jsonl.ts`, `zip.ts`), not this module.
 *
 * Routing in `create.ts`:
 *   1. `--training-type` → Profile (via `getProfile`)
 *   2. Profile.acceptedExtensions → match file extension
 *   3. `detectModality(filePath)` → "text" | "audio" | "image" | "video"
 *   4. Profile validates / resolves hyper-params using detected modality
 */
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { extname } from "path";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { DataModality } from "../finetune/profiles/types.ts";

/**
 * Inspect a file and return its data modality.
 *
 * `.jsonl` → read the first non-blank line, parse JSON, check fields.
 * `.zip`   → locate `data.jsonl` inside the archive, read its first line.
 *
 * Image data returns `"image"` (T2I) or `"image-i2i"` (I2I, first record
 * has `input_img`). Callers that don't distinguish can normalise to `"image"`.
 *
 * Throws USAGE if the file extension is not `.jsonl` or `.zip`, or if the
 * content cannot be parsed.
 */
export async function detectModality(filePath: string): Promise<DataModality> {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".jsonl") return detectFromJsonl(filePath);
  if (ext === ".zip") return detectFromZip(filePath);
  throw new BailianError(
    `Cannot inspect file with extension "${ext}". Expected .jsonl or .zip.`,
    ExitCode.USAGE,
  );
}

/**
 * Read the first non-blank line of a JSONL file and determine the modality.
 */
async function detectFromJsonl(filePath: string): Promise<DataModality> {
  const firstLine = await readFirstNonBlankLine(filePath);
  if (!firstLine) {
    throw new BailianError(
      `JSONL file is empty or contains only blank lines: ${filePath}`,
      ExitCode.USAGE,
    );
  }
  const modality = classifyRecord(firstLine);
  // JSONL files are always text data (chatml / dpo / cpt).
  return modality === "unknown" ? "text" : modality;
}

/**
 * Locate `data.jsonl` inside a ZIP archive, extract its first non-blank line,
 * and determine the modality.
 *
 * Uses `yauzl` for streaming access — only the target entry is read, the rest
 * of the archive is skipped.
 */
async function detectFromZip(filePath: string): Promise<DataModality> {
  const firstLine = await readFirstLineFromZipEntry(filePath, "data.jsonl");
  if (!firstLine) {
    throw new BailianError(
      `ZIP archive does not contain "data.jsonl" or it is empty: ${filePath}`,
      ExitCode.USAGE,
      `Audio training data must be a ZIP with data.jsonl at the root and a train/ subfolder.`,
    );
  }
  const modality = classifyRecord(firstLine);
  if (modality === "unknown") {
    throw new BailianError(
      `ZIP data.jsonl does not match any supported media format ` +
        `(expected wav_fn / img_path / first_frame_path / video_path): ${filePath}`,
      ExitCode.USAGE,
      `ZIP archives are for audio/image/video training data. ` +
        `For text data, use a .jsonl file instead.`,
    );
  }
  return modality;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Classify a JSON record into a data modality based on its field names. */
function classifyRecord(line: string): DataModality | "unknown" {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line);
  } catch {
    throw new BailianError(
      `Failed to parse first JSON record for modality detection: ${line.slice(0, 120)}`,
      ExitCode.USAGE,
    );
  }
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new BailianError(
      `Expected a JSON object as the first record, got ${Array.isArray(record) ? "array" : typeof record}.`,
      ExitCode.USAGE,
    );
  }
  if ("wav_fn" in record) return "audio";
  if ("img_path" in record) {
    // Image generation: distinguish T2I (no input_img) from I2I (has input_img).
    // The subtype drives hyper-parameter defaults (max_pixels 2k vs 1k).
    return "input_img" in record ? "image-i2i" : "image";
  }
  if ("first_frame_path" in record || "video_path" in record) {
    // Video generation (Wan i2v/kf2v): distinguish first-frame-only (i2v) from
    // first+last-frame (kf2v, has last_frame_path). The subtype lets the
    // profile cross-check the chosen --model against the data shape.
    return "last_frame_path" in record ? "video-kf2v" : "video";
  }
  // No known media field found — caller decides how to handle.
  return "unknown";
}

/** Read the first non-blank line from a file using a readline stream. */
function readFirstNonBlankLine(filePath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let found = false;
    rl.on("line", (line) => {
      if (found) return;
      const trimmed = line.trim();
      if (trimmed.length === 0) return;
      found = true;
      rl.close();
      stream.destroy();
      resolve(trimmed);
    });
    rl.on("close", () => {
      if (!found) resolve(null);
    });
    rl.on("error", reject);
    stream.on("error", reject);
  });
}

/**
 * Open a ZIP archive, locate the entry with the given name, and return the
 * first non-blank line from its content. Returns `null` if the entry is not
 * found or is empty.
 *
 * Delegates ZIP open/locate to the shared `openZipAndFindEntry` helper in
 * `validate/zip.ts` — avoids duplicating yauzl boilerplate.
 */
function readFirstLineFromZipEntry(zipPath: string, entryName: string): Promise<string | null> {
  return import("./validate/zip.ts")
    .then(({ openZipAndFindEntry }) => openZipAndFindEntry(zipPath, entryName))
    .then(({ entry, zipfile }) => {
      return new Promise<string | null>((resolve, reject) => {
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            zipfile.close();
            reject(
              new BailianError(
                `Failed to read "${entryName}" from ZIP: ${streamErr?.message}`,
                ExitCode.USAGE,
              ),
            );
            return;
          }
          const rl = createInterface({ input: readStream, crlfDelay: Infinity });
          let found = false;
          rl.on("line", (line) => {
            if (found) return;
            const trimmed = line.trim();
            if (trimmed.length === 0) return;
            found = true;
            rl.close();
            readStream.destroy();
            zipfile.close();
            resolve(trimmed);
          });
          rl.on("close", () => {
            if (!found) {
              zipfile.close();
              resolve(null);
            }
          });
          rl.on("error", (readError) => {
            zipfile.close();
            reject(readError);
          });
        });
      });
    })
    .catch((error) => {
      // openZipAndFindEntry rejects when the entry is not found — treat as null.
      if (error instanceof Error && error.message.includes("not found in ZIP")) {
        return null;
      }
      throw error;
    });
}
