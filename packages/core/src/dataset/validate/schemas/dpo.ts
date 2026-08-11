/**
 * DPO record schema — `{"messages": [...], "chosen": {role,content}, "rejected": {...}}`.
 *
 * DPO is a superset of ChatML: it carries the same `messages[]` prompt plus
 * a preference pair. So this spec delegates the prompt validation to the
 * ChatML inspector and only adds the chosen / rejected checks on top. If the
 * prompt is too broken to inspect (no `messages[]`), the preference checks
 * are skipped to keep the report focused — matching the original early-return
 * semantics.
 */
import { makeIssue } from "../common.ts";
import type { ValidationIssue } from "../types.ts";
import type { RecordSchemaSpec } from "./types.ts";
import { inspectChatMLRecord, inspectMessageObject } from "./chatml.ts";

function inspectDPORecord(record: Record<string, unknown>, lineNo: number): ValidationIssue[] {
  const out = inspectChatMLRecord(record, lineNo);
  const messages = record.messages;
  if (!Array.isArray(messages) || messages.length === 0) return out;

  // DPO convention: messages should end with a user message (the prompt that
  // chosen/rejected respond to). If the last message is assistant, it's likely
  // a structural mistake.
  const lastMsg = messages[messages.length - 1] as Record<string, unknown> | null;
  if (lastMsg && lastMsg.role !== "user") {
    out.push(
      makeIssue(
        "warning",
        "DPO_LAST_MSG_NOT_USER",
        `DPO "messages" should end with a "user" message (the prompt for chosen/rejected). ` +
          `Got "${String(lastMsg.role)}" as the last message.`,
        { line: lineNo, path: `messages[${messages.length - 1}].role` },
      ),
    );
  }

  const hasChosen = "chosen" in record;
  const hasRejected = "rejected" in record;

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

/**
 * DPO schema. Auto-detect: a record is treated as DPO if it carries either
 * `chosen` or `rejected` — we deliberately match on EITHER (not both) so a
 * record that has only one of the pair still hits the DPO inspector and gets
 * a precise "missing rejected" / "missing chosen" error instead of falling
 * through to ChatML where the preference fields would be silently ignored.
 */
export const dpoSchema: RecordSchemaSpec = {
  name: "dpo",
  detect: (record) => "chosen" in record || "rejected" in record,
  inspect: inspectDPORecord,
};
