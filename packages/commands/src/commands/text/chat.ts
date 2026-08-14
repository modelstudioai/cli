import {
  defineCommand,
  chatPath,
  responsesPath,
  parseSSE,
  detectOutputFormat,
  readTextFromPathOrStdin,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type ResponsesRequest,
  type ResponsesResponse,
  type ResponsesStreamEvent,
  type StreamChunk,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { ansi, emitResult, emitBare } from "bailian-cli-runtime";
import { readFileSync } from "fs";
import {
  assertResponsesStreamCompleted,
  inspectResponsesStreamEvent,
  extractResponsesText,
} from "./responses.ts";

const CHAT_FLAGS = {
  api: {
    type: "string",
    valueHint: "<chat|responses>",
    choices: ["chat", "responses"] as const,
    description: "API to call (default: chat)",
  },
  model: { type: "string", valueHint: "<model>", description: "Model ID (default: qwen3.8-max)" },
  message: {
    type: "array",
    valueHint: "<text>",
    description: "Message text (repeatable, prefix role: to set role); or use --messages-file",
  },
  messagesFile: {
    type: "string",
    valueHint: "<path>",
    description: "JSON file with messages array (use - for stdin)",
  },
  system: { type: "string", valueHint: "<text>", description: "System prompt" },
  maxTokens: {
    type: "number",
    valueHint: "<n>",
    description: "Maximum tokens to generate (default: 4096)",
  },
  temperature: {
    type: "number",
    valueHint: "<n>",
    description: "Sampling temperature (0.0, 2.0]",
  },
  topP: { type: "number", valueHint: "<n>", description: "Nucleus sampling threshold" },
  stream: { type: "switch", description: "Stream response tokens (default: on in TTY)" },
  tool: {
    type: "array",
    valueHint: "<json-or-path>",
    description: "Tool definition as JSON or file path (repeatable)",
  },
  enableThinking: {
    type: "switch",
    description: "Enable thinking/reasoning mode (for qwen3/qwq models)",
  },
  thinkingBudget: {
    type: "number",
    valueHint: "<n>",
    description: "Max tokens for thinking (default: 4096)",
  },
} satisfies FlagsDef;
type ChatFlags = ParsedFlags<typeof CHAT_FLAGS>;

interface ParsedMessages {
  system?: string;
  messages: ChatMessage[];
}

function parseMessages(flags: ChatFlags): ParsedMessages {
  const messages: ChatMessage[] = [];
  let system: string | undefined;

  if (flags.system) {
    system = flags.system;
  }

  if (flags.messagesFile) {
    const raw = readTextFromPathOrStdin(flags.messagesFile);
    const parsed = JSON.parse(raw) as Array<{ role: string; content: string }>;
    for (const parsedMessage of parsed) {
      if (parsedMessage.role === "system") {
        system = typeof parsedMessage.content === "string" ? parsedMessage.content : "";
      } else {
        messages.push(parsedMessage as ChatMessage);
      }
    }
  }

  if (flags.message) {
    const validRoles = new Set(["system", "user", "assistant"]);
    const messageValues = flags.message;
    for (const messageValue of messageValues) {
      const colonIndex = messageValue.indexOf(":");
      const maybeRole = colonIndex !== -1 ? messageValue.slice(0, colonIndex) : "";

      if (validRoles.has(maybeRole)) {
        const content = messageValue.slice(colonIndex + 1);
        if (maybeRole === "system") {
          system = content;
        } else {
          messages.push({ role: maybeRole as "user" | "assistant", content });
        }
      } else {
        messages.push({ role: "user", content: messageValue });
      }
    }
  }

  return { system, messages };
}

export default defineCommand({
  description: "Send a text model request (OpenAI compatible, DashScope)",
  auth: "apiKey",
  usageArgs: "--message <text> [flags]",
  flags: CHAT_FLAGS,
  exampleArgs: [
    '--message "What is Qwen?"',
    `--api responses --model qwen3.8-max --tool '{"type":"web_search"}' --message "Search for recent Alibaba Cloud news"`,
    '--model qwen-max --system "You are a coding assistant." --message "Write fizzbuzz in Python"',
    '--message "Hello" --message "assistant:Hi!" --message "How are you?"',
    "--messages-file - --stream",
    '--message "Hello" --output json',
    '--model qwq-plus --message "Solve 1+1" --enable-thinking',
  ],
  validate: (flags) => {
    if (!flags.message && !flags.messagesFile) {
      return "Provide --message or --messages-file.";
    }
    if (flags.api === "responses" && flags.thinkingBudget !== undefined) {
      return "--thinking-budget is not supported by the Responses API.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const { system, messages } = parseMessages(flags);

    const api = flags.api ?? "chat";
    const model = flags.model || settings.defaultTextModel || "qwen3.8-max";
    const shouldStream = flags.stream || process.stdout.isTTY;
    const format = detectOutputFormat(settings.output);

    // Build messages array with system prompt
    const allMessages: ChatMessage[] = [];
    if (system) {
      allMessages.push({ role: "system", content: system });
    }
    allMessages.push(...messages);

    let body: ChatRequest | ResponsesRequest;
    if (api === "responses") {
      body = {
        model,
        input: allMessages,
        max_output_tokens: flags.maxTokens ?? 4096,
        stream: shouldStream,
      };
    } else {
      body = {
        model,
        messages: allMessages,
        max_tokens: flags.maxTokens ?? 4096,
        stream: shouldStream,
      };
    }

    if (flags.temperature !== undefined) body.temperature = flags.temperature;
    if (flags.topP !== undefined) body.top_p = flags.topP;

    if (flags.enableThinking) {
      body.enable_thinking = true;
      if (api === "chat" && "messages" in body && flags.thinkingBudget !== undefined) {
        body.thinking_budget = flags.thinkingBudget;
      }
    }

    if (flags.tool) {
      const tools = flags.tool.map((toolValue) => {
        try {
          return JSON.parse(toolValue);
        } catch {
          const raw = readFileSync(toolValue, "utf-8");
          return JSON.parse(raw);
        }
      });
      body.tools = tools;
    }

    if (settings.dryRun) {
      emitResult({ request: body }, format);
      return;
    }

    if (shouldStream) {
      const responseStream = await ctx.client.request({
        path: api === "responses" ? responsesPath() : chatPath(),
        method: "POST",
        body,
        stream: true,
      });

      let textContent = "";
      let inThinking = false;
      let responsesCompleted = false;
      const writesStreamingStdout = format === "text";
      const isTTY = process.stdout.isTTY;
      const statusOut =
        format === "json" ? process.stderr : isTTY ? process.stdout : process.stderr;
      const resultOut = process.stdout;
      const statusColor = ansi(statusOut);

      for await (const event of parseSSE(responseStream)) {
        if (event.data === "[DONE]") break;
        if (api === "responses") {
          let parsedEvent: ResponsesStreamEvent;
          try {
            parsedEvent = JSON.parse(event.data) as ResponsesStreamEvent;
          } catch {
            continue;
          }

          const update = inspectResponsesStreamEvent(parsedEvent);
          if (update.delta) {
            textContent += update.delta;
            if (writesStreamingStdout) resultOut.write(update.delta);
          }
          if (update.completed) {
            responsesCompleted = true;
            break;
          }
          continue;
        }

        try {
          const parsed = JSON.parse(event.data) as StreamChunk;

          for (const choice of parsed.choices) {
            const delta = choice.delta;

            // Handle thinking/reasoning content
            if (delta.reasoning_content) {
              if (writesStreamingStdout && !inThinking) {
                inThinking = true;
                statusOut.write(statusColor.dim("Thinking:\n"));
              }
              if (writesStreamingStdout) statusOut.write(delta.reasoning_content);
            }

            // Handle regular content
            if (delta.content) {
              if (writesStreamingStdout && inThinking) {
                statusOut.write(`${statusColor.reset}\n\nResponse:\n`);
                inThinking = false;
              }
              textContent += delta.content;
              if (writesStreamingStdout) resultOut.write(delta.content);
            }
          }
        } catch {
          // Skip unparseable chunks
        }
      }
      if (api === "responses") assertResponsesStreamCompleted(responsesCompleted);
      if (inThinking) statusOut.write(statusColor.reset);

      if (format === "json") {
        emitResult({ content: textContent }, format);
      } else {
        resultOut.write("\n");
      }
    } else if (api === "responses") {
      const response = await ctx.client.requestJson<ResponsesResponse>({
        path: responsesPath(),
        method: "POST",
        body,
      });

      const text = extractResponsesText(response);

      if (settings.quiet || format === "text") {
        emitBare(text);
      } else {
        emitResult(response, format);
      }
    } else {
      const response = await ctx.client.requestJson<ChatResponse>({
        path: chatPath(),
        method: "POST",
        body,
      });

      const text = response.choices?.[0]?.message?.content ?? "";

      if (settings.quiet || format === "text") {
        emitBare(text);
      } else {
        emitResult(response, format);
      }
    }
  },
});
