/**
 * ChatML record schema — `{"messages": [{role, content}, ...]}` (SFT).
 *
 * Also acts as the registry's fallback / catch-all: when auto-detect runs
 * and no more specific schema matches, ChatML is selected. `inspectMessageObject`
 * lives here because it is the canonical per-message check; the DPO schema
 * imports it to validate `chosen` / `rejected` preference messages.
 *
 * Content format: supports both legacy plain-string content (`"content": "…"`)
 * and the current platform array format (`"content": [{"text": "…"}, …]`).
 * The array format may also carry `image` / `video` items for VL multimodal
 * understanding data.
 *
 * Tool calling: supports `role: "tool"` messages with `tool_call_id`, and
 * `assistant.tool_calls` arrays. Validates id correspondence.
 */
import { makeIssue } from "../common.ts";
import type { ValidationIssue } from "../types.ts";
import type { RecordSchemaSpec } from "./types.ts";

const VALID_ROLES = new Set(["system", "user", "assistant", "tool"]);

/**
 * Validate a content field that may be:
 *  - A plain string (legacy format)
 *  - An array of content items: `[{text: "…"}, {image: "…"}, {video: "…"|"…"}, …]`
 *
 * Returns issues found. `path` scopes the location for error reporting.
 */
export function inspectContentField(
  content: unknown,
  lineNo: number,
  path: string,
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (typeof content === "string") {
    // Legacy string format — always valid.
    return out;
  }
  if (!Array.isArray(content)) {
    out.push(
      makeIssue(
        "error",
        "INVALID_CONTENT",
        `"content" must be a string or an array of content items (got ${typeof content}).`,
        { line: lineNo, path },
      ),
    );
    return out;
  }
  if (content.length === 0) {
    out.push(
      makeIssue("error", "EMPTY_CONTENT_ARRAY", `"content" array must not be empty.`, {
        line: lineNo,
        path,
      }),
    );
    return out;
  }
  for (let idx = 0; idx < content.length; idx++) {
    const item = content[idx];
    const itemPath = `${path}[${idx}]`;
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      out.push(
        makeIssue("error", "INVALID_CONTENT_ITEM", `Content item must be an object.`, {
          line: lineNo,
          path: itemPath,
        }),
      );
      continue;
    }
    const obj = item as Record<string, unknown>;
    const hasText = "text" in obj;
    const hasImage = "image" in obj;
    const hasVideo = "video" in obj;
    if (!hasText && !hasImage && !hasVideo) {
      out.push(
        makeIssue(
          "error",
          "CONTENT_ITEM_NO_KNOWN_FIELD",
          `Content item must contain at least one of: "text", "image", "video".`,
          { line: lineNo, path: itemPath },
        ),
      );
      continue;
    }
    if (hasText && typeof obj.text !== "string") {
      out.push(
        makeIssue("error", "INVALID_CONTENT_TEXT", `"text" in content item must be a string.`, {
          line: lineNo,
          path: `${itemPath}.text`,
        }),
      );
    }
    if (hasImage && typeof obj.image !== "string") {
      out.push(
        makeIssue("error", "INVALID_CONTENT_IMAGE", `"image" in content item must be a string.`, {
          line: lineNo,
          path: `${itemPath}.image`,
        }),
      );
    }
    if (hasVideo) {
      // video can be a string (file path) or an array of strings (frame list)
      const video = obj.video;
      if (typeof video !== "string" && !Array.isArray(video)) {
        out.push(
          makeIssue(
            "error",
            "INVALID_CONTENT_VIDEO",
            `"video" in content item must be a string (file path) or an array of strings (frame list).`,
            { line: lineNo, path: `${itemPath}.video` },
          ),
        );
      } else if (Array.isArray(video)) {
        for (let frameIdx = 0; frameIdx < video.length; frameIdx++) {
          if (typeof video[frameIdx] !== "string") {
            out.push(
              makeIssue(
                "error",
                "INVALID_VIDEO_FRAME",
                `Video frame list item at index ${frameIdx} must be a string.`,
                { line: lineNo, path: `${itemPath}.video[${frameIdx}]` },
              ),
            );
          }
        }
      }
    }
  }
  return out;
}

/**
 * Validate `tool_calls` array on an assistant message.
 * Each entry: `{id: string, type: "function", function: {name: string, arguments: string}}`.
 */
function inspectToolCalls(toolCalls: unknown, lineNo: number, path: string): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!Array.isArray(toolCalls)) {
    out.push(
      makeIssue("error", "INVALID_TOOL_CALLS", `"tool_calls" must be an array.`, {
        line: lineNo,
        path,
      }),
    );
    return out;
  }
  for (let idx = 0; idx < toolCalls.length; idx++) {
    const call = toolCalls[idx];
    const callPath = `${path}[${idx}]`;
    if (call === null || typeof call !== "object" || Array.isArray(call)) {
      out.push(
        makeIssue("error", "INVALID_TOOL_CALL", `tool_calls item must be an object.`, {
          line: lineNo,
          path: callPath,
        }),
      );
      continue;
    }
    const obj = call as Record<string, unknown>;
    if (typeof obj.id !== "string" || obj.id.length === 0) {
      out.push(
        makeIssue("error", "TOOL_CALL_MISSING_ID", `tool_calls item must have a non-empty "id".`, {
          line: lineNo,
          path: `${callPath}.id`,
        }),
      );
    }
    if (obj.type !== "function") {
      out.push(
        makeIssue(
          "warning",
          "TOOL_CALL_TYPE_NOT_FUNCTION",
          `tool_calls item "type" should be "function" (got "${String(obj.type)}").`,
          { line: lineNo, path: `${callPath}.type` },
        ),
      );
    }
    const fn = obj.function;
    if (fn === null || typeof fn !== "object" || Array.isArray(fn)) {
      out.push(
        makeIssue(
          "error",
          "TOOL_CALL_MISSING_FUNCTION",
          `tool_calls item must have a "function" object.`,
          {
            line: lineNo,
            path: `${callPath}.function`,
          },
        ),
      );
    } else {
      const fnObj = fn as Record<string, unknown>;
      if (typeof fnObj.name !== "string" || fnObj.name.length === 0) {
        out.push(
          makeIssue("error", "TOOL_CALL_FN_NO_NAME", `tool_calls function must have a "name".`, {
            line: lineNo,
            path: `${callPath}.function.name`,
          }),
        );
      }
      if (typeof fnObj.arguments !== "string") {
        out.push(
          makeIssue(
            "error",
            "TOOL_CALL_FN_ARGS_NOT_STRING",
            `tool_calls function "arguments" must be a JSON string.`,
            { line: lineNo, path: `${callPath}.function.arguments` },
          ),
        );
      }
    }
  }
  return out;
}

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
  if (typeof role !== "string" || !VALID_ROLES.has(role)) {
    out.push(
      makeIssue(
        "error",
        "INVALID_ROLE",
        `Invalid role "${String(role)}". Expected one of: system, user, assistant, tool.`,
        { line: lineNo, path: `${path}.role` },
      ),
    );
  }

  // tool role: must have tool_call_id
  if (role === "tool") {
    if (typeof record.tool_call_id !== "string" || record.tool_call_id.length === 0) {
      out.push(
        makeIssue(
          "error",
          "TOOL_MISSING_CALL_ID",
          `A "tool" role message must have a non-empty "tool_call_id".`,
          { line: lineNo, path: `${path}.tool_call_id` },
        ),
      );
    }
  }

  // content validation: string or array format
  if (!("content" in record)) {
    // assistant messages with tool_calls may omit content
    if (role !== "assistant" || !("tool_calls" in record)) {
      out.push(
        makeIssue("error", "MISSING_CONTENT", `"content" field is missing.`, {
          line: lineNo,
          path: `${path}.content`,
        }),
      );
    }
  } else {
    out.push(...inspectContentField(record.content, lineNo, `${path}.content`));
  }

  // tool_calls on assistant
  if ("tool_calls" in record) {
    out.push(...inspectToolCalls(record.tool_calls, lineNo, `${path}.tool_calls`));
  }

  // OpenAI migration guard: name / weight are not supported by Bailian
  if ("name" in record) {
    out.push(
      makeIssue(
        "warning",
        "UNSUPPORTED_FIELD_NAME",
        `Field "name" is not supported by Bailian. Remove it when migrating from OpenAI/Azure.`,
        { line: lineNo, path: `${path}.name` },
      ),
    );
  }
  if ("weight" in record) {
    out.push(
      makeIssue(
        "warning",
        "UNSUPPORTED_FIELD_WEIGHT",
        `Field "weight" is not supported by Bailian. Remove it when migrating from OpenAI/Azure.`,
        { line: lineNo, path: `${path}.weight` },
      ),
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
  let lastAssistantIdx = -1;
  const toolCallIds = new Set<string>();
  const toolResponseIds = new Set<string>();

  for (let idx = 0; idx < messages.length; idx++) {
    const msg = messages[idx];
    const path = `messages[${idx}]`;
    out.push(...inspectMessageObject(msg, lineNo, path));
    const msgObj = msg as Record<string, unknown> | null;
    const role = msgObj?.role;

    if (role === "system") {
      if (idx !== 0) {
        out.push(
          makeIssue(
            "warning",
            "SYSTEM_NOT_FIRST",
            `"system" message should appear at index 0; found at index ${idx}.`,
            { line: lineNo, path: `${path}.role` },
          ),
        );
      }
      sawSystem = true;
    }

    if (role === "assistant") {
      lastAssistantIdx = idx;
      // Collect tool_calls ids
      if (msgObj && Array.isArray(msgObj.tool_calls)) {
        for (const call of msgObj.tool_calls) {
          const callObj = call as Record<string, unknown> | null;
          if (callObj && typeof callObj.id === "string") {
            toolCallIds.add(callObj.id);
          }
        }
      }
    }

    if (role === "tool") {
      const callId = msgObj?.tool_call_id;
      if (typeof callId === "string" && callId.length > 0) {
        toolResponseIds.add(callId);
      }
    }

    // Consecutive same-role warning (skip tool — multiple tool responses are normal)
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

  // tool_call_id correspondence: every tool response should reference a known call id
  for (const responseId of toolResponseIds) {
    if (!toolCallIds.has(responseId)) {
      out.push(
        makeIssue(
          "warning",
          "TOOL_CALL_ID_UNMATCHED",
          `tool message references tool_call_id "${responseId}" which does not match any assistant tool_calls[].id.`,
          { line: lineNo, path: "messages" },
        ),
      );
    }
  }

  // thinking tag check: <think>…</think>` should only appear in the last assistant message
  if (lastAssistantIdx >= 0) {
    for (let idx = 0; idx < messages.length; idx++) {
      if (idx === lastAssistantIdx) continue;
      const msg = messages[idx] as Record<string, unknown> | null;
      if (msg?.role !== "assistant") continue;
      const content = msg?.content;
      if (contentHasThinkTag(content)) {
        out.push(
          makeIssue(
            "warning",
            "THINK_TAG_NOT_LAST",
            `Thinking tags (<think>…</think>) should only appear in the last assistant message, found at messages[${idx}].`,
            { line: lineNo, path: `messages[${idx}].content` },
          ),
        );
      }
    }
  }

  // loss_weight validation (record-level, invite-only parameter)
  if ("loss_weight" in record) {
    const lossWeight = record.loss_weight;
    if (typeof lossWeight !== "number" || lossWeight < 0 || lossWeight > 1) {
      out.push(
        makeIssue(
          "error",
          "INVALID_LOSS_WEIGHT",
          `"loss_weight" must be a number between 0.0 and 1.0 (got ${JSON.stringify(lossWeight)}).`,
          { line: lineNo, path: "loss_weight" },
        ),
      );
    }
  }

  // OpenAI migration guard at record level
  if ("name" in record && !("messages" in record)) {
    // Only warn at record level if it's not inside messages (messages handled above)
    out.push(
      makeIssue(
        "warning",
        "UNSUPPORTED_FIELD_NAME",
        `Record-level field "name" is not supported by Bailian.`,
        { line: lineNo, path: "name" },
      ),
    );
  }
  if ("weight" in record) {
    out.push(
      makeIssue(
        "warning",
        "UNSUPPORTED_FIELD_WEIGHT",
        `Record-level field "weight" is not supported by Bailian. Remove it when migrating from OpenAI/Azure.`,
        { line: lineNo, path: "weight" },
      ),
    );
  }

  return out;
}

/** Check whether content (string or array) contains a <think> tag. */
function contentHasThinkTag(content: unknown): boolean {
  if (typeof content === "string") {
    return content.includes("<think>");
  }
  if (Array.isArray(content)) {
    return content.some((item) => {
      if (item && typeof item === "object" && "text" in item) {
        return (
          typeof (item as Record<string, unknown>).text === "string" &&
          ((item as Record<string, unknown>).text as string).includes("<think>")
        );
      }
      return false;
    });
  }
  return false;
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
