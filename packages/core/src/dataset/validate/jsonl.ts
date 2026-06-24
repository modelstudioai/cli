/**
 * JSONL validator for ChatML-style datasets (e.g. SFT training data).
 *
 * Schema scope: each line is `{"messages": [{role, content}, ...]}` with
 * roles in (system, user, assistant). This matches the platform's documented
 * SFT training format. Other JSONL schemas (e.g. evaluation datasets with
 * different field shapes) should ship their own validator and register it —
 * the registry can be extended in the future to dispatch on `(extension,
 * purpose)` rather than extension alone if a purpose-specific .jsonl schema
 * appears.
 *
 * Two-stage strategy (see decision log):
 *   1. Quick scan — readline pass over the entire file checking only that
 *      every non-empty line begins with '{' and ends with '}'. No JSON.parse.
 *      Catches the most common mistake: a pretty-printed JSON dumped under a
 *      .jsonl extension.
 *   2. Sampled deep check — JSON.parse the first 50 lines, ~100 evenly spaced
 *      interior lines, and the last 10 lines, validating the ChatML structure
 *      (`messages` array with role/content). `--full-validate` lifts the
 *      sampling cap.
 */
import { createReadStream } from "fs";
import { createInterface } from "readline";
import type { ValidatorSpec, ValidateOpts, ValidationResult, ValidationIssue } from "./types.ts";
import { makeIssue, pickSampleLines } from "./common.ts";

const VALID_ROLES = new Set(["system", "user", "assistant"]);

interface QuickScanResult {
  totalLines: number;
  blankLines: number;
  /** Issues from the structural pass (first non-{...} line, etc.). */
  issues: ValidationIssue[];
}

async function quickScan(filePath: string, signal?: AbortSignal): Promise<QuickScanResult> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const issues: ValidationIssue[] = [];
  let totalLines = 0;
  let blankLines = 0;

  // Cap reported structural issues so a totally broken file doesn't flood
  // the report; we still keep counting to report accurate stats.
  const MAX_ISSUES = 20;

  for await (const raw of rl) {
    if (signal?.aborted) break;
    totalLines++;
    const line = raw.trim();
    if (line.length === 0) {
      blankLines++;
      continue;
    }
    if (issues.length >= MAX_ISSUES) continue;
    if (line[0] !== "{" || line[line.length - 1] !== "}") {
      issues.push(
        makeIssue(
          "error",
          "MALFORMED_LINE",
          `Line does not start with '{' and end with '}'. JSONL requires one minified JSON object per line — pretty-printed JSON or arrays are not accepted here.`,
          { line: totalLines },
        ),
      );
    }
  }
  return { totalLines, blankLines, issues };
}

interface DeepCheckResult {
  sampled: number;
  issues: ValidationIssue[];
}

async function deepCheck(
  filePath: string,
  totalLines: number,
  fullValidate: boolean,
  signal?: AbortSignal,
): Promise<DeepCheckResult> {
  const targetSet = fullValidate ? null : new Set(pickSampleLines(totalLines));

  const issues: ValidationIssue[] = [];
  let sampled = 0;
  const MAX_ISSUES = 30;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  for await (const raw of rl) {
    if (signal?.aborted) break;
    lineNo++;
    if (targetSet && !targetSet.has(lineNo)) continue;
    const line = raw.trim();
    if (line.length === 0) continue;
    sampled++;
    if (issues.length >= MAX_ISSUES) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      issues.push(
        makeIssue("error", "MALFORMED_JSON", `JSON.parse failed: ${(err as Error).message}`, {
          line: lineNo,
        }),
      );
      continue;
    }

    issues.push(...inspectChatMLRecord(obj, lineNo));
  }
  return { sampled, issues };
}

/**
 * Validate one ChatML record. Hard errors are returned with severity "error",
 * advisory checks (role ordering) as "warning". Caller dedupes/aggregates.
 */
function inspectChatMLRecord(obj: unknown, lineNo: number): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    out.push(
      makeIssue(
        "error",
        "RECORD_NOT_OBJECT",
        `Each line must be a JSON object, got ${Array.isArray(obj) ? "array" : typeof obj}.`,
        { line: lineNo },
      ),
    );
    return out;
  }

  const record = obj as Record<string, unknown>;
  const messages = record.messages;
  if (!Array.isArray(messages)) {
    out.push(
      makeIssue(
        "error",
        "MISSING_MESSAGES",
        `Required field "messages" is missing or not an array.`,
        { line: lineNo, path: "messages" },
      ),
    );
    return out;
  }
  if (messages.length === 0) {
    out.push(
      makeIssue("error", "EMPTY_MESSAGES", `"messages" must contain at least one entry.`, {
        line: lineNo,
        path: "messages",
      }),
    );
    return out;
  }

  let sawSystem = false;
  let lastRole: string | undefined;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const path = `messages[${i}]`;
    if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
      out.push(
        makeIssue("error", "MESSAGE_NOT_OBJECT", `Message must be an object.`, {
          line: lineNo,
          path,
        }),
      );
      continue;
    }
    const m = msg as Record<string, unknown>;
    const role = m.role;
    const content = m.content;
    if (typeof role !== "string" || !VALID_ROLES.has(role)) {
      out.push(
        makeIssue(
          "error",
          "INVALID_ROLE",
          `Invalid role "${String(role)}". Expected one of: system, user, assistant.`,
          { line: lineNo, path: `${path}.role` },
        ),
      );
    }
    if (typeof content !== "string") {
      out.push(
        makeIssue(
          "error",
          "INVALID_CONTENT",
          `"content" must be a string (got ${typeof content}).`,
          { line: lineNo, path: `${path}.content` },
        ),
      );
    }

    if (role === "system") {
      if (i !== 0) {
        out.push(
          makeIssue(
            "warning",
            "SYSTEM_NOT_FIRST",
            `"system" message should appear at index 0; found at index ${i}.`,
            { line: lineNo, path: `${path}.role` },
          ),
        );
      }
      sawSystem = true;
    }

    if (lastRole === role && (role === "user" || role === "assistant")) {
      out.push(
        makeIssue(
          "warning",
          "ROLE_NOT_ALTERNATING",
          `Consecutive ${role} messages — user/assistant turns should typically alternate.`,
          { line: lineNo, path: `${path}.role` },
        ),
      );
    }
    if (typeof role === "string") lastRole = role;
  }
  // Soft check: messages without any user role almost certainly indicate a bug.
  if (!messages.some((m) => (m as Record<string, unknown>).role === "user")) {
    out.push(
      makeIssue("warning", "NO_USER_ROLE", `No "user" message found in this sample.`, {
        line: lineNo,
        path: "messages",
      }),
    );
  }
  if (sawSystem && messages.length === 1) {
    out.push(
      makeIssue("warning", "SYSTEM_ONLY", `Sample only contains a "system" message.`, {
        line: lineNo,
        path: "messages",
      }),
    );
  }
  return out;
}

export const jsonlValidator: ValidatorSpec = {
  format: "jsonl",
  extensions: [".jsonl"],
  async validate(filePath: string, opts: ValidateOpts): Promise<ValidationResult> {
    const start = Date.now();
    const quick = await quickScan(filePath, opts.signal);
    if (quick.totalLines === 0 || quick.totalLines === quick.blankLines) {
      return {
        valid: false,
        format: "jsonl",
        filePath,
        errors: [makeIssue("error", "EMPTY_FILE", `File contains no non-blank lines.`)],
        warnings: [],
        stats: {
          totalRecords: 0,
          sampledRecords: 0,
          durationMs: Date.now() - start,
        },
      };
    }

    // Stage-1 errors (structural). If any fatal MALFORMED_LINE was emitted,
    // skip the deep parse to give a focused message.
    if (quick.issues.length > 0) {
      return {
        valid: false,
        format: "jsonl",
        filePath,
        errors: quick.issues,
        warnings: [],
        stats: {
          totalRecords: quick.totalLines - quick.blankLines,
          sampledRecords: 0,
          durationMs: Date.now() - start,
        },
      };
    }

    const deep = await deepCheck(
      filePath,
      quick.totalLines,
      Boolean(opts.fullValidate),
      opts.signal,
    );

    const errors = deep.issues.filter((i) => i.severity === "error");
    const warnings = deep.issues.filter((i) => i.severity === "warning");
    return {
      valid: errors.length === 0,
      format: "jsonl",
      filePath,
      errors,
      warnings,
      stats: {
        totalRecords: quick.totalLines - quick.blankLines,
        sampledRecords: deep.sampled,
        durationMs: Date.now() - start,
      },
    };
  },
};
