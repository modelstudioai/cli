import type {
  LLMCallOptions,
  LLMClient,
  Message,
  ToolCall,
  ToolDef,
  ToolResponse,
} from "../types.ts";
import { extractJson } from "./json.ts";
import { LLMError, kindFromStatus, throwIfCancelled } from "./errors.ts";

const JSON_RETRY_HINT =
  "IMPORTANT: Your previous response was not valid JSON. Respond with ONLY a valid JSON object, no other text.";

/** Model used by every LLM stage (agent, intent, holistic score, explain) unless --model overrides it. */
export const DEFAULT_LLM_MODEL = "qwen-flash-2025-07-28";

export interface LLMClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Default model for chat/chatJson calls. */
  defaultModel?: string;
  timeoutMs?: number;
  /** When true, requests include enable_thinking and reasoning_content is captured. */
  enableThinking?: boolean;
  /**
   * Stage names whose calls run in thinking mode (streamed, enable_thinking).
   * Defaults to none; set to ["intent"] to think only during intent analysis.
   */
  thinkingStages?: readonly string[];
  /** Mutable array; the client pushes { stage, content } after each call that returns reasoning. */
  thinkingLog?: { stage: string; content: string }[];
  /** When set (with enableThinking), chat() streams and invokes this for every reasoning chunk as it arrives. */
  onThinking?: (stage: string, chunk: string) => void;
  /** 每次实际 HTTP 尝试均通知，包含 JSON 重试和引擎内部调用。 */
  onRequest?: (stage: string) => void;
}

interface ChatCompletionResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    };
  }[];
}

/**
 * Self-contained OpenAI-compatible LLM client over fetch.
 * Kept free of bailian-cli-core imports so the engine compiles standalone;
 * the command layer wires it up from ctx.client.baseUrl + credentials.
 */
export function createLLMClient(options: LLMClientOptions): LLMClient {
  const {
    baseUrl,
    apiKey,
    defaultModel = DEFAULT_LLM_MODEL,
    timeoutMs = 60_000,
    enableThinking,
    thinkingStages,
    thinkingLog,
    onThinking,
  } = options;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/compatible-mode/v1/chat/completions`;

  // 超时覆盖响应体读取；调用方取消优先于请求级超时，禁止被当作可重试错误。
  async function request<T>(
    body: Record<string, unknown>,
    opts: LLMCallOptions,
    consume: (res: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    throwIfCancelled(opts.signal);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout.signal]) : timeout.signal;
    try {
      options.onRequest?.(opts.stage ?? "llm");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const text = await res.text();
        let payload: unknown = { message: text.slice(0, 200) };
        try {
          payload = JSON.parse(text);
        } catch {
          /* 保留非 JSON 错误正文。 */
        }
        throw apiError(payload, res.status, res.headers.get("x-request-id") ?? undefined);
      }
      const result = await consume(res, signal);
      throwIfCancelled(opts.signal);
      return result;
    } catch (err) {
      throwIfCancelled(opts.signal);
      if (timeout.signal.aborted)
        throw new LLMError("timeout", `LLM request timed out after ${timeoutMs}ms`, { cause: err });
      if (err instanceof LLMError) throw err;
      if (err instanceof SyntaxError)
        throw new LLMError("parse", "LLM 响应不是有效 JSON", { cause: err });
      const detail = (err as { cause?: { code?: string } })?.cause?.code ?? (err as Error)?.message;
      throw new LLMError("network", `LLM request failed: ${detail}`, { cause: err });
    } finally {
      clearTimeout(timer);
    }
  }

  async function complete(
    body: Record<string, unknown>,
    opts: LLMCallOptions = {},
  ): Promise<ChatCompletionResponse> {
    return request(body, opts, async (res) => {
      const parsed = (await res.json()) as ChatCompletionResponse & { error?: unknown };
      if (parsed.error)
        throw apiError(parsed, undefined, res.headers.get("x-request-id") ?? undefined);
      const choice = parsed.choices?.[0];
      validateFinish(choice?.finish_reason);
      if (!choice?.message) throw new LLMError("parse", "LLM 响应缺少 message");
      validateTools(choice.message.tool_calls ?? []);
      if (!choice.message.content?.trim() && !choice.message.tool_calls?.length)
        throw new LLMError("parse", "LLM 返回空响应");
      const reasoning = choice.message.reasoning_content;
      if (thinkingLog && reasoning)
        thinkingLog.push({ stage: opts.stage ?? "llm", content: reasoning });
      return parsed;
    });
  }

  // 普通聊天和工具聊天共用 SSE 解码，避免两套完成/错误语义发生偏移。
  async function stream(
    messages: Message[],
    tools: ToolDef[] | undefined,
    opts: LLMCallOptions = {},
  ): Promise<ToolResponse> {
    const stage = opts.stage ?? (tools ? "agent" : "llm");
    return request(
      {
        model: opts.model ?? defaultModel,
        messages: messages.map(toWireMessage),
        ...(tools ? { tools } : {}),
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 4096,
        stream: true,
        enable_thinking: true,
      },
      { ...opts, stage },
      async (res, signal) => {
        if (!res.body) throw new LLMError("parse", "SSE 响应缺少正文");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";
        let reasoning = "";
        let completed = false;
        let eventType = "";
        let dataLines: string[] = [];
        const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();
        const consumeEvent = () => {
          if (!dataLines.length) return;
          const data = dataLines.join("\n");
          dataLines = [];
          if (data.trim() === "[DONE]") {
            completed = true;
            return;
          }
          const chunk = JSON.parse(data) as StreamChunk;
          if (chunk.error || eventType === "error")
            throw apiError(chunk, undefined, res.headers.get("x-request-id") ?? undefined);
          const choice = chunk.choices?.find(
            (entry) => entry.index === 0 || entry.index === undefined,
          );
          validateFinish(choice?.finish_reason);
          const delta = choice?.delta;
          if (!delta) return;
          if (delta.reasoning_content) {
            reasoning += delta.reasoning_content;
            onThinking?.(stage, delta.reasoning_content);
          }
          content += delta.content ?? "";
          for (const fragment of delta.tool_calls ?? []) {
            const index = fragment.index;
            if (index === undefined || !Number.isInteger(index) || index < 0)
              throw new LLMError("parse", "工具片段缺少有效 index");
            const entry = toolCallMap.get(index) ?? { id: "", name: "", arguments: "" };
            if (fragment.id) {
              if (entry.id && entry.id !== fragment.id)
                throw new LLMError("parse", "同一工具 index 返回不同 id");
              entry.id = fragment.id;
            }
            entry.name += fragment.function?.name ?? "";
            entry.arguments += fragment.function?.arguments ?? "";
            toolCallMap.set(index, entry);
          }
        };
        const consumeLine = (raw: string) => {
          const line = raw.replace(/\r$/, "");
          if (!line) {
            consumeEvent();
            eventType = "";
          } else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
          else if (line.startsWith("event:")) eventType = line.slice(6).trim();
        };
        const cancel = () => {
          void reader.cancel().catch(() => {});
        };
        signal.addEventListener("abort", cancel, { once: true });
        try {
          while (!completed) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            signal.throwIfAborted();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              consumeLine(line);
              if (completed) break;
            }
            if (done) {
              if (!completed && buffer) consumeLine(buffer);
              if (!completed) consumeEvent();
              if (!completed) throw new LLMError("parse", "SSE 在完成标记前断流");
            }
          }
          const toolCalls: ToolCall[] = [...toolCallMap.entries()]
            .sort(([left], [right]) => left - right)
            .map(([, call]) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: call.arguments },
            }));
          validateTools(toolCalls);
          if (!content.trim() && !toolCalls.length) throw new LLMError("parse", "SSE 返回空响应");
          if (thinkingLog && reasoning) thinkingLog.push({ stage, content: reasoning });
          return { content, toolCalls };
        } finally {
          signal.removeEventListener("abort", cancel);
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      },
    );
  }

  /** Thinking applies when the call's stage is listed, or globally via enableThinking. */
  const wantsThinking = (opts?: LLMCallOptions): boolean =>
    (opts?.stage !== undefined && thinkingStages?.includes(opts.stage)) || enableThinking === true;

  return {
    async chat(messages, opts) {
      if (wantsThinking(opts)) return (await stream(messages, undefined, opts)).content;
      const response = await complete(
        {
          model: opts?.model ?? defaultModel,
          messages,
          temperature: opts?.temperature ?? 0,
          max_tokens: opts?.maxTokens ?? 4096,
        },
        { ...opts },
      );
      return response.choices?.[0]?.message?.content ?? "";
    },

    async chatJson(messages, opts) {
      const first = await this.chat(messages, opts);
      try {
        return extractJson(first) as never;
      } catch {
        // Retry once with explicit JSON instruction before giving up.
        // HTTP failures of the retry propagate as-is (already classified).
        const retry = await this.chat(
          [
            ...messages,
            { role: "assistant", content: first },
            { role: "user", content: JSON_RETRY_HINT },
          ],
          opts,
        );
        try {
          return extractJson(retry) as never;
        } catch (err) {
          throw new LLMError("parse", `LLM returned invalid JSON twice: ${retry.slice(0, 120)}`, {
            cause: err,
          });
        }
      }
    },

    async chatWithTools(messages, tools: ToolDef[], opts): Promise<ToolResponse> {
      if (wantsThinking(opts)) return stream(messages, tools, opts);
      const response = await complete(
        {
          model: opts?.model ?? defaultModel,
          messages: messages.map(toWireMessage),
          tools,
          temperature: 0,
          max_tokens: 4096,
        },
        { ...opts, stage: opts?.stage ?? "agent" },
      );
      const msg = response.choices?.[0]?.message;
      return {
        content: msg?.content ?? "",
        toolCalls: msg?.tool_calls ?? [],
      };
    },
  };
}

interface StreamChunk {
  error?: unknown;
  choices?: {
    index?: number;
    finish_reason?: string;
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
}

function apiError(payload: unknown, status?: number, requestId?: string): LLMError {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const error =
    root.error && typeof root.error === "object" ? (root.error as Record<string, unknown>) : root;
  const code = typeof error.code === "string" ? error.code : undefined;
  const kind = status
    ? kindFromStatus(status)
    : /invalid.?api.?key|unauthorized|accessdenied|forbidden/i.test(code ?? "")
      ? "auth"
      : /quota|throttl|rate.?limit/i.test(code ?? "")
        ? "rate_limit"
        : "http";
  const message =
    typeof error.message === "string"
      ? error.message
      : typeof root.error === "string"
        ? root.error
        : "服务端错误";
  return new LLMError(kind, `LLM request failed: ${message}`, {
    status,
    code,
    requestId: typeof root.request_id === "string" ? root.request_id : requestId,
  });
}

function validateFinish(reason?: string): void {
  if (reason && reason !== "stop" && reason !== "tool_calls")
    throw new LLMError("parse", `LLM 响应未完整结束: ${reason}`);
}

function validateTools(calls: ToolCall[]): void {
  const ids = new Set<string>();
  for (const call of calls) {
    if (!call.id || ids.has(call.id) || !call.function?.name || call.type !== "function")
      throw new LLMError("parse", "工具调用缺少标识或标识重复");
    ids.add(call.id);
    let args: unknown;
    try {
      args = JSON.parse(call.function.arguments);
    } catch (err) {
      throw new LLMError("parse", "工具参数不完整", { cause: err });
    }
    if (!args || typeof args !== "object" || Array.isArray(args))
      throw new LLMError("parse", "工具参数必须是 JSON 对象");
  }
}

function toWireMessage(msg: Message): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: msg.role, content: msg.content };
  if (msg.tool_call_id) wire.tool_call_id = msg.tool_call_id;
  if (msg.tool_calls) wire.tool_calls = msg.tool_calls;
  return wire;
}
