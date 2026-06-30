/**
 * CPT record schema — `{"text": "..."}` (continual pre-training).
 *
 * Unlike ChatML/DPO, CPT feeds raw continuation text rather than a
 * `messages[]` conversation. The platform's CPT format is one JSON object per
 * line carrying a single `text` field. This spec enforces exactly that shape
 * so a CPT job (`--training-type cpt`) fails fast at validate time instead of
 * being forced through the ChatML inspector and rejected for a missing
 * `messages` field it was never meant to carry.
 *
 * Auto-detect deliberately matches only when `text` is present AND `messages`
 * is absent — so an SFT record that happens to carry a `text` field still
 * routes to ChatML, and a mixed record (both `text` and `messages`) is left
 * for the ChatML catch-all rather than silently swallowed as CPT.
 */
import { makeIssue } from "../common.ts";
import type { ValidationIssue } from "../types.ts";
import type { RecordSchemaSpec } from "./types.ts";

function inspectCPTRecord(record: Record<string, unknown>, lineNo: number): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!("text" in record)) {
    out.push(
      makeIssue("error", "MISSING_TEXT", `Required field "text" is missing.`, {
        line: lineNo,
        path: "text",
      }),
    );
    return out;
  }
  const text = record.text;
  if (typeof text !== "string") {
    out.push(
      makeIssue("error", "INVALID_TEXT", `"text" must be a string (got ${typeof text}).`, {
        line: lineNo,
        path: "text",
      }),
    );
    return out;
  }
  if (text.trim().length === 0) {
    out.push(
      makeIssue("error", "EMPTY_TEXT", `"text" must not be empty / whitespace-only.`, {
        line: lineNo,
        path: "text",
      }),
    );
  }
  return out;
}

/**
 * CPT schema. Auto-detect: a record is treated as CPT if it carries a `text`
 * field and no `messages` field. Placed after DPO (which keys off
 * chosen/rejected) and before ChatML (the catch-all), so the three schemas
 * partition cleanly by their distinguishing field.
 */
export const cptSchema: RecordSchemaSpec = {
  name: "cpt",
  detect: (record) => "text" in record && !("messages" in record),
  inspect: inspectCPTRecord,
};
