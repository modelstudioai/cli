/**
 * JSONL validator for ChatML-style datasets (e.g. SFT training data).
 *
 * Schema scope: the `.jsonl` ChatML family. Two record shapes are recognized:
 *   - SFT:  `{"messages": [{role, content}, ...]}`
 *   - DPO:  `{"messages": [...], "chosen": {role, content}, "rejected": {...}}`
 * `chosen`/`rejected` are single assistant messages — the preferred vs
 * dispreferred response. Which shape is enforced is selected by
 * `ValidateOpts.schema` (`"chatml"` | `"dpo"`), defaulting to per-record
 * auto-detect. Other JSONL schemas (e.g. evaluation datasets with a different
 * field shape) should ship their own validator and register it — the registry
 * can be extended in the future to dispatch on `(extension, purpose)` rather
 * than extension alone if a purpose-specific .jsonl schema appears.
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
import type {
  ValidatorSpec,
  ValidateOpts,
  ValidationResult,
  ValidationIssue,
  DatasetSchema,
} from "./types.ts";
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
 * Structural checks for a single message object `{role, content}`. Shared by
 * the `messages[]` entries and the DPO `chosen` / `rejected` preference fields
 * (which are each a single assistant message). Caller-supplied `path` scopes
 * the issue location (e.g. `messages[2]` vs `chosen`).
 */
function inspectMessageObject(msg: unknown, lineNo: number, path: string): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
    out.push(
      makeIssue("error", "MESSAGE_NOT_OBJECT", `Message must be an object.`, {
        line: lineNo,
        path,
      }),
    );
    return out;
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
      makeIssue("error", "INVALID_CONTENT", `"content" must be a string (got ${typeof content}).`, {
        line: lineNo,
        path: `${path}.content`,
      }),
    );
  }
  return out;
}

/**
 * Dispatch one record to the right schema inspector.
 *
 * SFT and DPO are not sibling schemas — DPO is a *superset* of SFT
 * (`{messages:[...], chosen, rejected}` = the ChatML prompt + a preference
 * pair). So this dispatcher only decides *whether* to also validate the
 * preference fields; the `messages[]` core is always handled by
 * `inspectChatMLRecord` (DPO calls into it).
 *
 * Schema selection mirrors the `ValidateOpts.schema` contract:
 *   - `"chatml"`           → SFT only (preference fields ignored).
 *   - `"dpo"`              → DPO, strictly (every record must carry chosen+rejected).
 *   - `undefined` (auto)   → per record: DPO when `chosen`/`rejected` present, else SFT.
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
  const hasChosen = "chosen" in record;
  const hasRejected = "rejected" in record;
  const isDpo = schema === "dpo" || (schema === undefined && (hasChosen || hasRejected));
  return isDpo
    ? inspectDPORecord(record, lineNo, hasChosen, hasRejected)
    : inspectChatMLRecord(record, lineNo);
}

/**
 * SFT (ChatML) record: `{"messages": [{role, content}, ...]}`.
 *
 * Validates the shared `messages[]` core that every ChatML-family record
 * carries — including DPO, which is why `inspectDPORecord` delegates here for
 * the prompt portion. `chosen`/`rejected`, if present on the record, are
 * intentionally ignored: callers wanting those checked must go through DPO
 * mode. Hard errors return as "error", advisory role-ordering checks as
 * "warning".
 */
function inspectChatMLRecord(record: Record<string, unknown>, lineNo: number): ValidationIssue[] {
  const out: ValidationIssue[] = [];
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
    out.push(...inspectMessageObject(msg, lineNo, path));
    const role = (msg as Record<string, unknown> | null)?.role;

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

/**
 * DPO record: `{"messages": [...], "chosen": {role, content}, "rejected": {...}}`.
 *
 * The prompt context (`messages[]`) is validated by `inspectChatMLRecord`;
 * this function adds the preference pair on top. `chosen`/`rejected` are each a
 * single assistant message — the preferred vs dispreferred response — so they
 * reuse `inspectMessageObject` with a scoped `path`.
 *
 * If the prompt is structurally broken (missing/empty `messages`), the SFT
 * inspector already reported the hard error and we skip preference checks — a
 * record missing its prompt is too broken to meaningfully check chosen/rejected
 * on top, matching the original early-return semantics.
 */
function inspectDPORecord(
  record: Record<string, unknown>,
  lineNo: number,
  hasChosen: boolean,
  hasRejected: boolean,
): ValidationIssue[] {
  const out = inspectChatMLRecord(record, lineNo);
  const messages = record.messages;
  if (!Array.isArray(messages) || messages.length === 0) return out;

  if (!hasChosen) {
    out.push(
      makeIssue("error", "MISSING_CHOSEN", `DPO record is missing the "chosen" preference.`, {
        line: lineNo,
        path: "chosen",
      }),
    );
  }
  if (!hasRejected) {
    out.push(
      makeIssue("error", "MISSING_REJECTED", `DPO record is missing the "rejected" preference.`, {
        line: lineNo,
        path: "rejected",
      }),
    );
  }
  if (hasChosen) {
    out.push(...inspectMessageObject(record.chosen, lineNo, "chosen"));
    const role = (record.chosen as Record<string, unknown> | null)?.role;
    if (typeof role === "string" && role !== "assistant") {
      out.push(
        makeIssue(
          "warning",
          "PREFERENCE_ROLE_NOT_ASSISTANT",
          `"chosen" role should be "assistant" (got "${role}").`,
          { line: lineNo, path: "chosen.role" },
        ),
      );
    }
  }
  if (hasRejected) {
    out.push(...inspectMessageObject(record.rejected, lineNo, "rejected"));
    const role = (record.rejected as Record<string, unknown> | null)?.role;
    if (typeof role === "string" && role !== "assistant") {
      out.push(
        makeIssue(
          "warning",
          "PREFERENCE_ROLE_NOT_ASSISTANT",
          `"rejected" role should be "assistant" (got "${role}").`,
          { line: lineNo, path: "rejected.role" },
        ),
      );
    }
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
