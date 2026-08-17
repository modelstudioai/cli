/**
 * ZIP validator — audio / image / video training data archives.
 *
 * A training data ZIP must have:
 *   - `data.jsonl` at the root — the manifest mapping media files to labels.
 *     The platform requires data.jsonl to be directly visible when opening the
 *     ZIP (no wrapping folder).
 *   - Media files referenced by the manifest entries.
 *
 * This validator owns the **ZIP-level structural checks** (entries present,
 * references resolve, filename constraints). The **per-record JSONL content
 * validation** is delegated to the existing `jsonlValidator` — we extract
 * `data.jsonl` to a temp file, run the full pipeline (quickScan + deepCheck +
 * schema dispatch), and stitch the results together.
 *
 * The schema for `data.jsonl` records is passed via `opts.schema` (typically
 * `"tts"` for audio). The profile layer decides which schema to use based on
 * the detected modality — this validator is schema-agnostic.
 */
import { createReadStream, createWriteStream, mkdirSync, rmSync } from "fs";
import { createInterface } from "readline";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { randomBytes } from "crypto";
import * as yauzl from "yauzl";
import type { ValidatorSpec, ValidateOpts, ValidationResult, ValidationIssue } from "./types.ts";
import { makeIssue } from "./common.ts";
import { jsonlValidator } from "./jsonl.ts";
import { IMAGE_EXTENSIONS } from "./schemas/image.ts";

/**
 * Open a ZIP archive and locate a specific entry by name.
 * Returns the entry and zipfile handle — **caller must close the zipfile**.
 * Normalises entry names (backslash → forward-slash) and supports entries
 * at the root or inside subdirectories (matches `name === targetName` or
 * `name.endsWith("/${targetName}")`).
 *
 * Shared by `extractZipEntry` (this file) and `readFirstLineFromZipEntry`
 * (inspect.ts) to avoid duplicating yauzl open/iterate/locate boilerplate.
 */
export function openZipAndFindEntry(
  zipPath: string,
  targetName: string,
): Promise<{ entry: yauzl.Entry; zipfile: yauzl.ZipFile }> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(new Error(`Failed to open ZIP: ${err?.message ?? "unknown error"}`));
        return;
      }
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const name = entry.fileName.replace(/\\/g, "/");
        if (name === targetName || name.endsWith(`/${targetName}`)) {
          resolve({ entry, zipfile });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on("end", () => {
        zipfile.close();
        reject(new Error(`Entry "${targetName}" not found in ZIP`));
      });
      zipfile.on("error", reject);
    });
  });
}

/**
 * Collect all entry paths from a ZIP archive using yauzl.
 * Returns normalised forward-slash paths.
 */
function collectZipEntries(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(new Error(`Failed to open ZIP: ${err?.message ?? "unknown error"}`));
        return;
      }
      const entries: string[] = [];
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        entries.push(entry.fileName.replace(/\\/g, "/"));
        zipfile.readEntry();
      });
      zipfile.on("end", () => {
        zipfile.close();
        resolve(entries);
      });
      zipfile.on("error", reject);
    });
  });
}

/**
 * Platform filename constraints:
 * - Allowed charset: ASCII letters (a-z, A-Z), digits (0-9), underscore (_), hyphen (-)
 * - Filename (without extension) ≤ 120 characters
 * - Filenames must be globally unique (ignoring extension)
 */
const FILENAME_CHARSET_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_FILENAME_BASE_LENGTH = 120;

/** Extract the base name (no extension) from a path segment. */
function basenameNoExt(segment: string): string {
  const dot = segment.lastIndexOf(".");
  return dot > 0 ? segment.slice(0, dot) : segment;
}

/**
 * macOS Finder/zip metadata entries (`__MACOSX/` resource forks, `.DS_Store`,
 * AppleDouble `._*` files). They are packaging noise, not training data:
 * exclude them from filename constraints and media counting so Mac-created
 * archives don't fail on artifacts the user never sees.
 */
function isZipMetadataEntry(entry: string): boolean {
  if (entry === "__MACOSX" || entry.startsWith("__MACOSX/")) return true;
  const lastSegment =
    entry
      .split("/")
      .filter((segment) => segment.length > 0)
      .pop() ?? "";
  return lastSegment === ".DS_Store" || lastSegment.startsWith("._");
}

/**
 * Validate ZIP entry filenames against platform constraints.
 * Returns issues for charset violations, over-length names, and duplicates.
 * Exported for direct unit testing (not re-exported by the barrel).
 */
export function validateZipFilenames(entries: string[]): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const seenBasenames = new Map<string, string>(); // basename (no ext) → first full path
  const MAX_REPORTED = 10;

  for (const entry of entries) {
    // Skip directory entries and macOS packaging metadata
    if (entry.endsWith("/")) continue;
    if (isZipMetadataEntry(entry)) continue;

    // Check each path segment (folder names + file name)
    const segments = entry.split("/").filter((s) => s.length > 0);
    for (const segment of segments) {
      // Strip extension for the charset check on the base part
      const base = basenameNoExt(segment);
      const ext = segment.slice(base.length); // includes dot, e.g. ".jpg"

      // Charset check on base name (extension checked separately)
      if (base.length > 0 && !FILENAME_CHARSET_RE.test(base)) {
        if (out.length < MAX_REPORTED) {
          out.push(
            makeIssue(
              "error",
              "INVALID_FILENAME_CHARSET",
              `File/folder name "${segment}" contains invalid characters. ` +
                `Only a-z, A-Z, 0-9, underscore (_), and hyphen (-) are allowed.`,
              { path: entry },
            ),
          );
        }
      }

      // Extension charset (allow dot + alphanumeric)
      if (ext.length > 0 && !/^\.[a-zA-Z0-9]+$/.test(ext)) {
        if (out.length < MAX_REPORTED) {
          out.push(
            makeIssue(
              "error",
              "INVALID_FILENAME_CHARSET",
              `File extension "${ext}" in "${segment}" contains invalid characters.`,
              { path: entry },
            ),
          );
        }
      }
    }

    // Filename length check (base name without extension)
    const fileName = segments[segments.length - 1] ?? "";
    const baseName = basenameNoExt(fileName);
    if (baseName.length > MAX_FILENAME_BASE_LENGTH) {
      if (out.length < MAX_REPORTED) {
        out.push(
          makeIssue(
            "error",
            "FILENAME_TOO_LONG",
            `Filename "${fileName}" (without extension) exceeds ${MAX_FILENAME_BASE_LENGTH} characters ` +
              `(got ${baseName.length}). Shorten the name and re-upload.`,
            { path: entry },
          ),
        );
      }
    }

    // Global uniqueness check (ignoring extension, case-sensitive)
    if (baseName.length > 0) {
      const existing = seenBasenames.get(baseName);
      if (existing !== undefined) {
        if (out.length < MAX_REPORTED) {
          out.push(
            makeIssue(
              "error",
              "DUPLICATE_FILENAME",
              `Filename "${fileName}" conflicts with "${existing}" — names must be globally unique ` +
                `(ignoring extension) even across different folders.`,
              { path: entry },
            ),
          );
        }
      } else {
        seenBasenames.set(baseName, entry);
      }
    }
  }

  if (out.length >= MAX_REPORTED) {
    out.push(
      makeIssue(
        "warning",
        "FILENAME_ISSUES_TRUNCATED",
        `More filename issues exist but reporting is capped at ${MAX_REPORTED}.`,
      ),
    );
  }
  return out;
}

/**
 * Extract a single entry from a ZIP archive to a destination path.
 */
async function extractZipEntry(
  zipPath: string,
  entryName: string,
  destPath: string,
): Promise<void> {
  const { entry, zipfile } = await openZipAndFindEntry(zipPath, entryName);
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (streamErr, readStream) => {
      if (streamErr || !readStream) {
        zipfile.close();
        reject(streamErr ?? new Error("Failed to open entry stream"));
        return;
      }
      const writeStream = createWriteStream(destPath);
      pipeline(readStream, writeStream)
        .then(() => {
          zipfile.close();
          resolve();
        })
        .catch((pipelineError) => {
          zipfile.close();
          reject(pipelineError);
        });
    });
  });
}

/**
 * Read media file references from the first N records of a JSONL file to verify
 * that referenced files exist inside the ZIP.
 *
 * Collects from all known schema fields: `wav_fn` (audio), `img_path` +
 * `input_img` (image generation), `first_frame_path` / `last_frame_path` /
 * `video_path` (video generation), `image_fn` / `video_fn` (legacy).
 */
async function collectMediaRefs(
  jsonlPath: string,
  maxLines = 100,
): Promise<{ refs: string[]; totalLines: number }> {
  const stream = createReadStream(jsonlPath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const refs: string[] = [];
  let totalLines = 0;
  for await (const raw of rl) {
    totalLines++;
    if (refs.length >= maxLines) continue;
    const line = raw.trim();
    if (line.length === 0) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (typeof obj.wav_fn === "string") refs.push(obj.wav_fn);
      if (typeof obj.img_path === "string") refs.push(obj.img_path);
      if (typeof obj.input_img === "string") refs.push(obj.input_img);
      if (typeof obj.first_frame_path === "string") refs.push(obj.first_frame_path);
      if (typeof obj.last_frame_path === "string") refs.push(obj.last_frame_path);
      if (typeof obj.video_path === "string") refs.push(obj.video_path);
      if (typeof obj.image_fn === "string") refs.push(obj.image_fn);
      if (typeof obj.video_fn === "string") refs.push(obj.video_fn);
    } catch {
      // Parse errors are reported by the JSONL validator, not here.
    }
  }
  return { refs, totalLines };
}

export const zipValidator: ValidatorSpec = {
  format: "zip",
  extensions: [".zip"],

  async validate(filePath: string, opts: ValidateOpts): Promise<ValidationResult> {
    const start = Date.now();
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // --- 1. Collect ZIP entries ---
    let entries: string[];
    try {
      entries = await collectZipEntries(filePath);
    } catch (openError) {
      return {
        valid: false,
        format: "zip",
        filePath,
        errors: [
          makeIssue(
            "error",
            "ZIP_OPEN_FAILED",
            `Could not open ZIP archive: ${(openError as Error).message}`,
          ),
        ],
        warnings: [],
        stats: { durationMs: Date.now() - start },
      };
    }

    if (entries.length === 0) {
      return {
        valid: false,
        format: "zip",
        filePath,
        errors: [makeIssue("error", "ZIP_EMPTY", `ZIP archive contains no entries.`)],
        warnings: [],
        stats: { durationMs: Date.now() - start },
      };
    }

    // --- 2. Check for data.jsonl (must be at ZIP root) ---
    const hasRootDataJsonl = entries.some((entry) => entry === "data.jsonl");
    const nestedDataJsonl =
      !hasRootDataJsonl && entries.find((entry) => entry.endsWith("/data.jsonl"));
    if (!hasRootDataJsonl) {
      if (nestedDataJsonl) {
        errors.push(
          makeIssue(
            "error",
            "DATA_JSONL_NOT_AT_ROOT",
            `"data.jsonl" must be at the ZIP root (found "${nestedDataJsonl}"). ` +
              `Re-package so that opening the ZIP shows data.jsonl directly, without a wrapping folder.`,
          ),
        );
      } else {
        errors.push(
          makeIssue(
            "error",
            "MISSING_DATA_JSONL",
            `ZIP archive must contain "data.jsonl" at the root. ` +
              `This file maps media files (e.g. .wav, .jpg) to their labels.`,
          ),
        );
      }
    }

    // --- 2b. Filename constraints (charset, length, uniqueness) ---
    const filenameIssues = validateZipFilenames(entries);
    for (const issue of filenameIssues) {
      if (issue.severity === "error") errors.push(issue);
      else warnings.push(issue);
    }

    // --- 3. Check for train/ directory (modality-aware) ---
    // Audio TTS data uses a train/ subdirectory; image and video generation
    // data do not (image is flat; video i2v is flat, kf2v uses image//video/).
    // Only warn about missing train/ for audio (schema === "tts" or auto-detect
    // when we don't know the schema yet).
    const isImageSchema = opts.schema === "image";
    const isVideoSchema = opts.schema === "video";
    const hasTrainDir = entries.some((entry) => entry === "train/" || entry.startsWith("train/"));
    // The train/ layout is an audio-TTS convention (media referenced as
    // "train/xxx.wav"). It is only meaningful when the archive actually contains
    // .wav files — image/video ZIPs (flat, or kf2v's image//video/ layout)
    // legitimately have no train/ dir. Gating on .wav presence also fixes the
    // auto-detect path (opts.schema undefined), where we would otherwise
    // false-warn on every image/video archive.
    const hasWavFiles = entries.some((entry) => entry.toLowerCase().endsWith(".wav"));
    if (!hasTrainDir && !isImageSchema && !isVideoSchema && hasWavFiles) {
      warnings.push(
        makeIssue(
          "warning",
          "NO_TRAIN_DIR",
          `No "train/" directory found in the ZIP. Media files are typically ` +
            `placed under "train/" and referenced as "train/xxx.wav" in data.jsonl.`,
        ),
      );
    }

    // --- 3b. Minimum image count check (image generation only) ---
    // The platform requires at least 25 training images (50+ recommended).
    if (isImageSchema) {
      const MIN_IMAGES = 25;
      const imageFiles = entries.filter((entry) => {
        if (entry === "data.jsonl" || entry.endsWith("/data.jsonl")) return false;
        if (entry.endsWith("/")) return false; // directory entries
        if (isZipMetadataEntry(entry)) return false; // __MACOSX/._x.jpg is not an image
        const dot = entry.lastIndexOf(".");
        const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : "";
        return IMAGE_EXTENSIONS.has(ext);
      });
      if (imageFiles.length < MIN_IMAGES) {
        errors.push(
          makeIssue(
            "error",
            "INSUFFICIENT_IMAGES",
            `Found ${imageFiles.length} image(s) in ZIP, but image generation fine-tuning ` +
              `requires at least ${MIN_IMAGES} images (50+ recommended).`,
          ),
        );
      }
    }

    // If data.jsonl is missing entirely, we can't do JSONL content validation.
    if (!hasRootDataJsonl && !nestedDataJsonl) {
      return {
        valid: false,
        format: "zip",
        filePath,
        errors,
        warnings,
        stats: { totalRecords: entries.length, durationMs: Date.now() - start },
      };
    }

    // --- 4. Extract data.jsonl to a temp file and run jsonlValidator ---
    // Prefer root data.jsonl; fall back to nested for content validation even
    // though we already reported the root-placement error above.
    const dataJsonlEntry = hasRootDataJsonl
      ? "data.jsonl"
      : entries.find((entry) => entry.endsWith("/data.jsonl"))!;
    const tmpDir = join(tmpdir(), `bl-zip-${randomBytes(6).toString("hex")}`);
    mkdirSync(tmpDir, { recursive: true });
    const tmpJsonl = join(tmpDir, "data.jsonl");

    try {
      await extractZipEntry(filePath, dataJsonlEntry, tmpJsonl);
    } catch (extractError) {
      errors.push(
        makeIssue(
          "error",
          "EXTRACT_FAILED",
          `Failed to extract "data.jsonl" from ZIP: ${(extractError as Error).message}`,
        ),
      );
      rmSync(tmpDir, { recursive: true, force: true });
      return {
        valid: false,
        format: "zip",
        filePath,
        errors,
        warnings,
        stats: { durationMs: Date.now() - start },
      };
    }

    // Delegate JSONL content validation. The profile layer passes opts.schema
    // (e.g. "tts") so the right record-schema spec is used.
    const jsonlResult = await jsonlValidator.validate(tmpJsonl, opts);
    errors.push(...jsonlResult.errors);
    warnings.push(...jsonlResult.warnings);

    // --- 5. Verify media file references (sample first 100 records) ---
    if (jsonlResult.valid) {
      const { refs } = await collectMediaRefs(tmpJsonl);
      const entrySet = new Set(entries);
      // Media paths in data.jsonl are relative to the manifest's location. Many
      // official sample archives wrap everything in a single top-level folder
      // (e.g. "wan-i2v-valid-dataset/data.jsonl" alongside
      // "wan-i2v-valid-dataset/image_1.jpg"), so a bare "image_1.jpg" ref
      // resolves against that folder, not the ZIP root. Derive the manifest's
      // directory prefix and accept either the wrapped or root-relative form.
      const slash = dataJsonlEntry.lastIndexOf("/");
      const baseDir = slash >= 0 ? dataJsonlEntry.slice(0, slash + 1) : "";
      const danglingRefs: string[] = [];
      for (const ref of refs) {
        // Normalise: some archives use "train/foo.wav", some use "./train/foo.wav".
        const normalised = ref.replace(/^\.\//, "");
        if (entrySet.has(normalised) || entrySet.has(baseDir + normalised)) continue;
        danglingRefs.push(ref);
      }
      if (danglingRefs.length > 0) {
        const shown = danglingRefs.slice(0, 5).join(", ");
        const suffix = danglingRefs.length > 5 ? ` (and ${danglingRefs.length - 5} more)` : "";
        errors.push(
          makeIssue(
            "error",
            "DANGLING_MEDIA_REFS",
            `${danglingRefs.length} media file(s) referenced in data.jsonl not found in ZIP: ${shown}${suffix}`,
          ),
        );
      }
    }

    // --- 6. Clean up ---
    rmSync(tmpDir, { recursive: true, force: true });

    return {
      valid: errors.length === 0,
      format: "zip",
      filePath,
      errors,
      warnings,
      stats: {
        totalRecords: jsonlResult.stats.totalRecords ?? entries.length,
        sampledRecords: jsonlResult.stats.sampledRecords,
        durationMs: Date.now() - start,
      },
    };
  },
};
