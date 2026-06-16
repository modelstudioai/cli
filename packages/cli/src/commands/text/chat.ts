import {
  defineCommand,
  request,
  requestJson,
  chatEndpoint,
  parseSSE,
  detectOutputFormat,
  type GlobalFlags,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type StreamChunk,
  isInteractive,
} from "bailian-cli-core";
import { promptText, failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";
import { readFileSync } from "fs";

interface ParsedMessages {
  system?: string;
  messages: ChatMessage[];
}

function parseMessages(flags: GlobalFlags): ParsedMessages {
  const messages: ChatMessage[] = [];
  let system: string | undefined;

  if (flags.system) {
    system = flags.system as string;
  }

  if (flags.messagesFile) {
    const filePath = flags.messagesFile as string;
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
    const msgs = flags.message as string[];
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
  name: "text chat",
  description: "Send a chat completion (OpenAI compatible, DashScope)",
  usage: "bl text chat --message <text> [flags]",
  options: [
    { flag: "--model <model>", description: "Model ID (default: qwen3.7-max)" },
    {
      flag: "--message <text>",
      description: "Message text (repeatable, prefix role: to set role)",
      required: true,
      type: "array",
    },
    {
      flag: "--messages-file <path>",
      description: "JSON file with messages array (use - for stdin)",
    },
    { flag: "--system <text>", description: "System prompt" },
    {
      flag: "--max-tokens <n>",
      description: "Maximum tokens to generate (default: 4096)",
      type: "number",
    },
    { flag: "--temperature <n>", description: "Sampling temperature (0.0, 2.0]", type: "number" },
    { flag: "--top-p <n>", description: "Nucleus sampling threshold", type: "number" },
    { flag: "--stream", description: "Stream response tokens (default: on in TTY)" },
    {
      flag: "--tool <json-or-path>",
      description: "Tool definition as JSON or file path (repeatable)",
      type: "array",
    },
    {
      flag: "--enable-thinking",
      description: "Enable thinking/reasoning mode (for qwen3/qwq models)",
    },
    {
      flag: "--thinking-budget <n>",
      description: "Max tokens for thinking (default: 4096)",
      type: "number",
    },
  ],
  examples: [
    'bl text chat --message "What is Qwen?"',
    'bl text chat --model qwen-max --system "You are a coding assistant." --message "Write fizzbuzz in Python"',
    'bl text chat --message "Hello" --message "assistant:Hi!" --message "How are you?"',
    "cat conversation.json | bl text chat --messages-file - --stream",
    'bl text chat --message "Hello" --output json',
    'bl text chat --model qwq-plus --message "Solve 1+1" --enable-thinking',
  ],
  async run(config, flags) {
    const { system, messages: parsedMessages } = parseMessages(flags);
    let messages = parsedMessages;

    if (messages.length === 0) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({
          message: "Enter your message:",
        });
        if (!hint) {
          process.stderr.write("Chat cancelled.\n");
          process.exit(1);
        }
        messages = [{ role: "user", content: hint }];
      } else {
        failIfMissing("message", "bl text chat --message <text>");
      }
    }

    const model = flags.model || config.defaultTextModel || "qwen3.7-max";
    const shouldStream =
      flags.stream === true || (flags.stream === undefined && process.stdout.isTTY);
    const format = detectOutputFormat(config.output);

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

    if (config.dryRun) {
      emitResult({ request: body }, format);
      return;
    }

    const url = chatEndpoint(config.baseUrl);

    if (shouldStream) {
      const res = await request(config, {
        url,
        method: "POST",
        body,
        stream: true,
      });

      let textContent = "";
      let inThinking = false;
      const writesStreamingStdout = format === "text";
      const dim = config.noColor ? "" : "\x1b[2m";
      const reset = config.noColor ? "" : "\x1b[0m";
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
      const response = await requestJson<ChatResponse>(config, {
        url,
        method: "POST",
        body,
      });

      const text = response.choices?.[0]?.message?.content ?? "";

      if (config.quiet || format === "text") {
        emitBare(text);
      } else {
        emitResult(response, format);
      }
    }
  },
});
