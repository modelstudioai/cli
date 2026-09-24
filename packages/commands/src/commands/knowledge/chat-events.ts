import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";

type JsonObject = Record<string, unknown>;
export interface ChatPhase {
  stage: string;
  content: string;
}
export interface ChatResult {
  answer: string;
  request_id: string;
  phases: ChatPhase[];
  tools: JsonObject[];
  docs: unknown[];
  /** Final generation-end usage, never a sum of cumulative frames. */
  usage: JsonObject | null;
  events: Array<{ event?: string; data: string }>;
}
function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}
function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      const item = object(part);
      return item?.type === "text" && typeof item.text === "string" ? item.text : "";
    })
    .join("");
}

export function createChatAccumulator(
  localize: (text: LocalizedText) => string = (text) =>
    typeof text === "string" ? text : text["en-US"],
) {
  const result: ChatResult = {
    answer: "",
    request_id: "",
    phases: [],
    tools: [],
    docs: [],
    usage: null,
    events: [],
  };
  let lastStage = "unknown";
  let complete = false;
  return {
    accept(event: { event?: string; data: string }): ChatPhase[] {
      result.events.push({
        ...(event.event !== undefined ? { event: event.event } : {}),
        data: event.data,
      });
      if (event.data === "[DONE]") {
        complete = true;
        return [];
      }
      let payload: JsonObject | undefined;
      try {
        payload = object(JSON.parse(event.data));
      } catch {
        /* Unknown event data stays in events. */
      }
      if (
        event.event === "error" ||
        ((typeof payload?.code === "string" || typeof payload?.code === "number") &&
          !["200", "Success", "SUCCESS", "0"].includes(String(payload.code)))
      ) {
        const message = typeof payload?.message === "string" ? payload.message : event.data;
        throw new BailianError(message, ExitCode.GENERAL, undefined, {
          api: {
            apiCode: typeof payload?.code === "string" ? payload.code : undefined,
            requestId: typeof payload?.request_id === "string" ? payload.request_id : undefined,
          },
          rawResponse: event.data,
        });
      }
      if (!payload) return [];
      if (typeof payload.request_id === "string") result.request_id = payload.request_id;
      const output = object(payload.output);
      if (!result.request_id && typeof output?.request_id === "string")
        result.request_id = output.request_id;
      const choices = output?.choices;
      if (!Array.isArray(choices)) return [];
      const fragments: ChatPhase[] = [];
      // The API returns one completion. Keep any extra choices raw, never concatenate alternatives.
      const choice = object(choices[0]);
      const message = object(choice?.message);
      if (!message) return fragments;
      const extra = object(message.extra);
      const change = extra?.step_change;
      const explicitStage = extra?.step;
      let stage = typeof explicitStage === "string" ? explicitStage : lastStage;
      if (message.role === "tool" || change === "tool_return" || change === "tool_calling")
        stage = "tool_calling";
      else if (typeof explicitStage !== "string") {
        if (change === "generation_start" || change === "generation_end") stage = "generating";
        else if (change === "plan_start" || change === "plan_end") stage = "planning";
        else if (extra?.group === "generating") stage = "generating";
      }
      lastStage = stage;
      const content = contentText(message.content);
      if (stage === "generating" && message.role !== "tool") result.answer += content;
      if (content) {
        const fragment = { stage, content };
        result.phases.push(fragment);
        fragments.push(fragment);
      }
      if (
        message.role === "tool" ||
        change === "tool_return" ||
        (Array.isArray(message.tool_calls) && message.tool_calls.length > 0)
      ) {
        result.tools.push(message);
        const additional = object(message.additional_kwargs);
        let extraJson = additional?.extra_json;
        if (typeof extraJson === "string") {
          try {
            extraJson = JSON.parse(extraJson);
          } catch {
            /* Original data remains in tools/events. */
          }
        }
        const docs = object(extraJson)?.docs;
        if (Array.isArray(docs)) result.docs.push(...docs);
      }
      if (
        stage === "generating" &&
        (change === "generation_end" || choice?.finish_reason === "stop")
      ) {
        complete = true;
        if (object(payload.usage)) result.usage = object(payload.usage)!;
      }
      return fragments;
    },
    finish(): ChatResult {
      if (!complete || !result.answer.trim()) {
        throw new BailianError(
          localize({
            "en-US": "The chat stream ended without a complete final answer.",
            "zh-CN": "问答流结束时未收到完整的最终回答。",
          }),
          ExitCode.GENERAL,
        );
      }
      return result;
    },
  };
}
