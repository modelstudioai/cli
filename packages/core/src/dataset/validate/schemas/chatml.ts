/**
 * ChatML record schema — `{"messages": [{role, content}, ...]}` (SFT).
 *
 * Also acts as the registry's fallback / catch-all: when auto-detect runs
 * and no more specific schema matches, ChatML is selected. `inspectMessageObject`
 * lives here because it is the canonical per-message check; the DPO schema
 * imports it to validate `chosen` / `rejected` preference messages.
 */
import { makeIssue } from "../common.ts";
import type { ValidationIssue } from "../types.ts";
import type { RecordSchemaSpec } from "./types.ts";

const VALID_ROLES = new Set(["system", "user", "assistant"]);

/**
 * Structural checks for a single message object `{role, content}`. Shared by
 * the `messages[]` entries and the DPO `chosen` / `rejected` preference fields
 * (which are each a single assistant message). Caller-supplied `path` scopes
 * the issue location (e.g. `messages[2]` vs `chosen`).
 */
export function inspectMessageObject(
  msg: unknown,
  lineNo: number,
  path: string,
): ValidationIssue[] {
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
  const record = msg as Record<string, unknown>;
  const role = record.role;
  const content = record.content;
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
 * Validate the ChatML core (`messages[]`) of a record. DPO calls this
 * delegate for the prompt portion of its records. Hard errors are emitted as
 * "error"; role-ordering / role-presence advisories are "warning".
 */
export function inspectChatMLRecord(
  record: Record<string, unknown>,
  lineNo: number,
): ValidationIssue[] {
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
 * ChatML / SFT schema. The auto-detect predicate is `true` so it acts as the
 * registry fallback — any record that isn't picked up by a more specific
 * schema (DPO etc.) falls through to ChatML.
 */
export const chatmlSchema: RecordSchemaSpec = {
  name: "chatml",
  detect: () => true,
  inspect: inspectChatMLRecord,
};
