import {
  defineCommand,
  chatPath,
  parseSSE,
  detectOutputFormat,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type StreamChunk,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { readFileSync } from "fs";

const CHAT_FLAGS = {
  model: { type: "string", valueHint: "<model>", description: "Model ID (default: qwen3.7-max)" },
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
    const filePath = flags.messagesFile;
    const raw =
      filePath === "-" ? readFileSync("/dev/stdin", "utf-8") : readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Array<{ role: string; content: string }>;
    for (const m of parsed) {
      if (m.role === "system") {
        system = typeof m.content === "string" ? m.content : "";
      } else {
        messages.push(m as ChatMessage);
      }
    }
  }

  if (flags.message) {
    const validRoles = new Set(["system", "user", "assistant"]);
    const msgs = flags.message;
    for (const m of msgs) {
      const colonIdx = m.indexOf(":");
      const maybeRole = colonIdx !== -1 ? m.slice(0, colonIdx) : "";

      if (validRoles.has(maybeRole)) {
        const content = m.slice(colonIdx + 1);
        if (maybeRole === "system") {
          system = content;
        } else {
          messages.push({ role: maybeRole as "user" | "assistant", content });
        }
      } else {
        messages.push({ role: "user", content: m });
      }
    }
  }

  return { system, messages };
}

export default defineCommand({
  description: "Send a chat completion (OpenAI compatible, DashScope)",
  auth: "apiKey",
  usageArgs: "--message <text> [flags]",
  flags: CHAT_FLAGS,
  exampleArgs: [
    '--message "What is Qwen?"',
    '--model qwen-max --system "You are a coding assistant." --message "Write fizzbuzz in Python"',
    '--message "Hello" --message "assistant:Hi!" --message "How are you?"',
    "--messages-file - --stream",
    '--message "Hello" --output json',
    '--model qwq-plus --message "Solve 1+1" --enable-thinking',
  ],
  validate: (f) =>
    !f.message && !f.messagesFile ? "Provide --message or --messages-file." : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const { system, messages } = parseMessages(flags);

    const model = flags.model || settings.defaultTextModel || "qwen3.7-max";
    const shouldStream = flags.stream || process.stdout.isTTY;
    const format = detectOutputFormat(settings.output);

    // Build messages array with system prompt
    const allMessages: ChatMessage[] = [];
    if (system) {
      allMessages.push({ role: "system", content: system });
    }
    allMessages.push(...messages);

    const body: ChatRequest = {
      model,
      messages: allMessages,
      max_tokens: flags.maxTokens ?? 4096,
      stream: shouldStream,
    };

    if (flags.temperature !== undefined) body.temperature = flags.temperature;
    if (flags.topP !== undefined) body.top_p = flags.topP;

    if (flags.enableThinking) {
      body.enable_thinking = true;
      if (flags.thinkingBudget !== undefined) {
        body.thinking_budget = flags.thinkingBudget;
      }
    }

    if (flags.tool) {
      const tools = flags.tool.map((t) => {
        try {
          return JSON.parse(t);
        } catch {
          const raw = readFileSync(t, "utf-8");
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
      const res = await ctx.client.request({
        path: chatPath(),
        method: "POST",
        body,
        stream: true,
      });

      let textContent = "";
      let inThinking = false;
      const writesStreamingStdout = format === "text";
      const dim = settings.noColor ? "" : "\x1b[2m";
      const reset = settings.noColor ? "" : "\x1b[0m";
      const isTTY = process.stdout.isTTY;
      const statusOut =
        format === "json" ? process.stderr : isTTY ? process.stdout : process.stderr;
      const resultOut = process.stdout;

      for await (const event of parseSSE(res)) {
        if (event.data === "[DONE]") break;
        try {
          const parsed = JSON.parse(event.data) as StreamChunk;

          for (const choice of parsed.choices) {
            const delta = choice.delta;

            // Handle thinking/reasoning content
            if (delta.reasoning_content) {
              if (writesStreamingStdout && !inThinking) {
                inThinking = true;
                statusOut.write(`${dim}Thinking:\n`);
              }
              if (writesStreamingStdout) statusOut.write(delta.reasoning_content);
            }

            // Handle regular content
            if (delta.content) {
              if (writesStreamingStdout && inThinking) {
                statusOut.write(`${reset}\n\nResponse:\n`);
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
      if (inThinking) statusOut.write(reset);

      if (format === "json") {
        emitResult({ content: textContent }, format);
      } else {
        resultOut.write("\n");
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
