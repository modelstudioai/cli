// Local pre-flight validation for file uploads (doc upload).
// Default category: the lease/addFile `category` parameter accepts the literal
// "default" (verified against the live API), so no listCategory resolution is needed.
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { BailianError, ExitCode } from "bailian-cli-core";

const MB = 1024 * 1024;

export interface UploadFormatRule {
  maxBytes: number;
  /** block: exceeding the limit throws USAGE; warn: only a stderr warning (documented as a recommended limit) */
  enforce: "block" | "warn";
}

/**
 * Format allowlist based on the officially supported document formats.
 * .csv is inconsistent across the public docs — kept in the allowlist for now;
 * a server-side rejection would be passed through verbatim.
 */
export const UPLOAD_FORMAT_RULES: Record<string, UploadFormatRule> = {
  ".doc": { maxBytes: 150 * MB, enforce: "block" },
  ".docx": { maxBytes: 150 * MB, enforce: "block" },
  ".ppt": { maxBytes: 150 * MB, enforce: "block" },
  ".pptx": { maxBytes: 150 * MB, enforce: "block" },
  ".pdf": { maxBytes: 150 * MB, enforce: "block" },
  ".png": { maxBytes: 20 * MB, enforce: "block" },
  ".jpg": { maxBytes: 20 * MB, enforce: "block" },
  ".jpeg": { maxBytes: 20 * MB, enforce: "block" },
  ".bmp": { maxBytes: 20 * MB, enforce: "block" },
  ".gif": { maxBytes: 20 * MB, enforce: "block" },
  ".xls": { maxBytes: 10 * MB, enforce: "warn" },
  ".xlsx": { maxBytes: 10 * MB, enforce: "warn" },
  ".csv": { maxBytes: 10 * MB, enforce: "warn" },
  ".md": { maxBytes: 10 * MB, enforce: "warn" },
  ".txt": { maxBytes: 10 * MB, enforce: "warn" },
  ".html": { maxBytes: 10 * MB, enforce: "warn" },
};

/** Local pre-flight check before reading the file: extension allowlist + hard/soft size limits. File I/O failure → GENERAL + errno hint. */
export function checkUploadFile(filePath: string): { sizeBytes: number; warning?: string } {
  const extension = extname(filePath).toLowerCase();
  const rule = UPLOAD_FORMAT_RULES[extension];
  if (!rule) {
    throw new BailianError(
      `Unsupported file type: ${extension || basename(filePath)}`,
      ExitCode.USAGE,
      `Supported formats: ${Object.keys(UPLOAD_FORMAT_RULES).join(" ")}`,
    );
  }
  let sizeBytes: number;
  try {
    sizeBytes = statSync(filePath).size;
  } catch (error) {
    const errno = (error as { code?: string }).code ?? "unknown";
    throw new BailianError(
      `Cannot read file: ${filePath}`,
      ExitCode.GENERAL,
      `File system error (${errno}) — check the path and permissions.`,
    );
  }
  if (sizeBytes > rule.maxBytes) {
    const limitMb = rule.maxBytes / MB;
    if (rule.enforce === "block") {
      throw new BailianError(
        `File exceeds the ${limitMb} MB limit for ${extension}: ${basename(filePath)}`,
        ExitCode.USAGE,
      );
    }
    return {
      sizeBytes,
      warning: `${basename(filePath)} exceeds the recommended 10 MB for ${extension}; the server may reject or truncate it.`,
    };
  }
  return { sizeBytes };
}

// Known document-format extensions — used to tailor the hint on decode failure
// (pointing users to the document upload flow instead)
const DOCUMENT_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".pdf",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".bmp",
  ".gif",
]);

/**
 * Read a UTF-8 plain-text file (--content-file for chunk add/update).
 * Support is defined by content, not extension: any UTF-8 text is valid.
 * Strict decode failure → USAGE, with a hint pointing to the document upload
 * flow when the extension is a document format; file I/O failure → GENERAL + errno.
 */
export function readUtf8TextFile(filePath: string): string {
  let fileBuffer: Buffer;
  try {
    fileBuffer = readFileSync(filePath);
  } catch (error) {
    const errno = (error as { code?: string }).code ?? "unknown";
    throw new BailianError(
      `Cannot read file: ${filePath}`,
      ExitCode.GENERAL,
      `File system error (${errno}) — check the path and permissions.`,
    );
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(fileBuffer);
  } catch {
    const extension = extname(filePath).toLowerCase();
    const hint = DOCUMENT_EXTENSIONS.has(extension)
      ? "Document formats cannot be used as chunk content. Upload documents via the document upload command; to edit a chunk, save the text as .md/.txt first."
      : "Convert the file to UTF-8 encoding and retry.";
    throw new BailianError(
      `File is not valid UTF-8 plain text: ${basename(filePath)}`,
      ExitCode.USAGE,
      hint,
    );
  }
}
