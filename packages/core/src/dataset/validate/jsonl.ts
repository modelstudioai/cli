/**
 * JSONL validator — file-level scaffolding for the ChatML family.
 *
 * Per-record schema dispatch lives in `./schemas/` (`RecordSchemaSpec`). This
 * module is only responsible for the two file-level passes:
 *   1. Quick scan — readline pass over the entire file checking only that
 *      every non-empty line begins with '{' and ends with '}'. No JSON.parse.
 *      Catches the most common mistake: a pretty-printed JSON dumped under a
 *      .jsonl extension.
 *   2. Sampled deep check — JSON.parse the first 50 lines, ~100 evenly spaced
 *      interior lines, and the last 10 lines, then hand each parsed record to
 *      the schema registry. `--full-validate` lifts the sampling cap.
 *
 * Schema scope: today the only registered schemas are ChatML (SFT) and DPO
 * (preference pairs). Both share the `{messages: [...]}` core. A future
 * non-ChatML JSONL purpose (e.g. an evaluation dataset with a different
 * shape) ships its own `RecordSchemaSpec` and registers it — no change here.
 */
import { createReadStream } from "fs";
import { createInterface } from "readline";
import type {
  ValidatorSpec,
  ValidateOpts,
  ValidationResult,
  ValidationIssue,
  DatasetSchema,
} from "./types.ts";
import { makeIssue, pickSampleLines } from "./common.ts";
import { pickRecordSchema } from "./schemas/index.ts";

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
  schema: DatasetSchema | undefined,
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

    issues.push(...inspectRecord(obj, lineNo, schema));
  }
  return { sampled, issues };
}

/**
 * Dispatch one record to the right schema inspector via the schema registry.
 * The registry decides whether the record is DPO, ChatML, or some future
 * shape — this function only owns the "is this even an object?" guard so the
 * downstream specs can assume a real object.
 */
function inspectRecord(obj: unknown, lineNo: number, schema?: DatasetSchema): ValidationIssue[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return [
      makeIssue(
        "error",
        "RECORD_NOT_OBJECT",
        `Each line must be a JSON object, got ${Array.isArray(obj) ? "array" : typeof obj}.`,
        { line: lineNo },
      ),
    ];
  }
  const record = obj as Record<string, unknown>;
  const spec = pickRecordSchema(record, schema);
  return spec.inspect(record, lineNo);
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
      opts.schema,
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
