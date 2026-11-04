import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";
import { parseModelStreamEvent } from "./model-stream.ts";

export interface ChatStreamUpdate {
  content: string;
  reasoning: string;
}

export interface ChatStreamToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatStreamResult {
  content: string;
  tool_calls?: ChatStreamToolCall[];
  finish_reason: string | null;
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Aggregate Chat Completions SSE deltas with completion and tool-call checks. */
export function createChatCompletionStreamAccumulator(localize: (text: LocalizedText) => string): {
  readonly completed: boolean;
  accept(event: { event?: string; data: string }): ChatStreamUpdate;
  finish(): ChatStreamResult;
} {
  let completed = false;
  let content = "";
  let finishReason: string | null = null;
  const toolCalls = new Map<number, PendingToolCall>();

  const missingIndexError = () =>
    new BailianError(
      localize({
        "en-US": "Tool call delta is missing a valid index.",
        "zh-CN": "工具调用增量缺少有效的 index。",
      }),
      ExitCode.GENERAL,
    );

  const conflictingIdError = () =>
    new BailianError(
      localize({
        "en-US": "Tool call index returned conflicting ids.",
        "zh-CN": "同一工具调用 index 返回了不同的 id。",
      }),
      ExitCode.GENERAL,
    );

  const acceptToolCallDelta = (fragment: unknown): void => {
    const delta = asRecord(fragment);
    if (!delta) throw missingIndexError();

    const index = delta.index;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
      throw missingIndexError();
    }

    const entry = toolCalls.get(index) ?? { id: "", name: "", arguments: "" };
    if (typeof delta.id === "string" && delta.id) {
      if (entry.id && entry.id !== delta.id) throw conflictingIdError();
      entry.id = delta.id;
    }

    const functionDelta = asRecord(delta.function);
    if (typeof functionDelta?.name === "string") entry.name += functionDelta.name;
    if (typeof functionDelta?.arguments === "string") entry.arguments += functionDelta.arguments;

    toolCalls.set(index, entry);
  };

  return {
    get completed() {
      return completed;
    },

    accept(event: { event?: string; data: string }): ChatStreamUpdate {
      let contentDelta = "";
      let reasoningDelta = "";

      if (event.data === "[DONE]") {
        completed = true;
        return { content: "", reasoning: "" };
      }

      const parsed = parseModelStreamEvent(event);
      if (!parsed) return { content: "", reasoning: "" };

      const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
      for (const choiceValue of choices) {
        const choice = asRecord(choiceValue);
        if (!choice) continue;

        const delta = asRecord(choice.delta);
        if (delta) {
          if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
            reasoningDelta += delta.reasoning_content;
          }
          if (typeof delta.content === "string" && delta.content) {
            contentDelta += delta.content;
            content += delta.content;
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const fragment of delta.tool_calls) acceptToolCallDelta(fragment);
          }
        }

        if (typeof choice.finish_reason === "string" && choice.finish_reason) {
          if (finishReason === null) finishReason = choice.finish_reason;
          completed = true;
        }
      }

      return { content: contentDelta, reasoning: reasoningDelta };
    },

    finish(): ChatStreamResult {
      if (!completed) {
        throw new BailianError(
          localize({
            "en-US":
              "Stream disconnected before completion: stream closed before [DONE] or finish_reason.",
            "zh-CN": "流在完成前断开：未收到 [DONE] 或 finish_reason。",
          }),
          ExitCode.GENERAL,
        );
      }

      const sorted = [...toolCalls.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, call]) => call);

      const seenIds = new Set<string>();
      const tool_calls: ChatStreamToolCall[] = [];
      for (const call of sorted) {
        if (!call.id || !call.name) {
          throw new BailianError(
            localize({
              "en-US": "Tool call is missing a required id or function name.",
              "zh-CN": "工具调用缺少必需的 id 或 function.name。",
            }),
            ExitCode.GENERAL,
          );
        }
        if (seenIds.has(call.id)) {
          throw new BailianError(
            localize({
              "en-US": "Duplicate tool call id across indexes.",
              "zh-CN": "不同工具调用 index 返回了重复的 id。",
            }),
            ExitCode.GENERAL,
          );
        }
        seenIds.add(call.id);
        tool_calls.push({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        });
      }

      const result: ChatStreamResult = {
        content,
        finish_reason: finishReason,
      };
      if (tool_calls.length > 0) result.tool_calls = tool_calls;
      return result;
    },
  };
}
