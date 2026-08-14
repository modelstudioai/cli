import {
  defineCommand,
  chatPath,
  parseSSE,
  detectOutputFormat,
  readTextFromPathOrStdin,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type StreamChunk,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { ansi, emitResult, emitBare } from "bailian-cli-runtime";
import { readFileSync } from "fs";

const CHAT_FLAGS = {
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Model ID (default: qwen3.8-max)",
      "zh-CN": "模型 ID（默认：qwen3.8-max）",
    },
  },
  message: {
    type: "array",
    valueHint: "<text>",
    description: {
      "en-US": "Message text (repeatable, prefix role: to set role); or use --messages-file",
      "zh-CN": "消息文本（可重复；可使用 role: 前缀指定角色），也可使用 --messages-file",
    },
  },
  messagesFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "JSON file with messages array (use - for stdin)",
      "zh-CN": "包含 messages 数组的 JSON 文件（使用 - 从 stdin 读取）",
    },
  },
  system: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "System prompt", "zh-CN": "系统提示词" },
  },
  maxTokens: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Maximum tokens to generate (default: 4096)",
      "zh-CN": "最大生成 Token 数（默认：4096）",
    },
  },
  temperature: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Sampling temperature (0.0, 2.0]",
      "zh-CN": "采样温度 (0.0, 2.0]",
    },
  },
  topP: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Nucleus sampling threshold", "zh-CN": "核采样阈值" },
  },
  stream: {
    type: "switch",
    description: {
      "en-US": "Stream response tokens (default: on in TTY)",
      "zh-CN": "流式输出响应 Token（TTY 中默认开启）",
    },
  },
  tool: {
    type: "array",
    valueHint: "<json-or-path>",
    description: {
      "en-US": "Tool definition as JSON or file path (repeatable)",
      "zh-CN": "JSON 格式的工具定义或文件路径（可重复）",
    },
  },
  enableThinking: {
    type: "switch",
    description: {
      "en-US": "Enable thinking/reasoning mode (for qwen3/qwq models)",
      "zh-CN": "启用思考/推理模式（适用于 qwen3/qwq 模型）",
    },
  },
  thinkingBudget: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Max tokens for thinking (default: 4096)",
      "zh-CN": "思考过程最大 Token 数（默认：4096）",
    },
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
  description: {
    "en-US": "Send a chat completion (OpenAI compatible, DashScope)",
    "zh-CN": "发送聊天补全请求（兼容 OpenAI，基于 DashScope）",
  },
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

    const model = flags.model || settings.defaultTextModel || "qwen3.8-max";
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
      const isTTY = process.stdout.isTTY;
      const statusOut =
        format === "json" ? process.stderr : isTTY ? process.stdout : process.stderr;
      const resultOut = process.stdout;
      const statusColor = ansi(statusOut);

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
      if (inThinking) statusOut.write(statusColor.reset);

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
