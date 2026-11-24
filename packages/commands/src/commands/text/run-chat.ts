import {
  createChatCompletionStreamAccumulator,
  type ChatStreamContentMode,
} from "../shared/chat-completion-stream.ts";
import {
  parseSSE,
  readTextFromPathOrStdin,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type Client,
  type CommandOutput,
  type LocalizedText,
  type Settings,
} from "bailian-cli-core";
import { ansi } from "bailian-cli-runtime";

export interface TextMessageFlags {
  message?: string[];
  messagesFile?: string;
  system?: string;
}

export interface ParsedTextMessages {
  system?: string;
  messages: ChatMessage[];
}

export interface ParseTextMessagesOptions {
  /** When false, each --message is a literal user string (no role: prefix). Default true. */
  allowRolePrefix?: boolean;
}

/** Parse --message / --messages-file / --system into chat messages. */
export function parseTextMessages(
  flags: TextMessageFlags,
  options?: ParseTextMessagesOptions,
): ParsedTextMessages {
  const messages: ChatMessage[] = [];
  let system: string | undefined;
  const allowRolePrefix = options?.allowRolePrefix !== false;

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
    for (const messageValue of flags.message) {
      if (!allowRolePrefix) {
        messages.push({ role: "user", content: messageValue });
        continue;
      }

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

/** Build the final messages array including an optional system prompt. */
export function buildChatMessages(parsed: ParsedTextMessages): ChatMessage[] {
  const allMessages: ChatMessage[] = [];
  if (parsed.system) {
    allMessages.push({ role: "system", content: parsed.system });
  }
  allMessages.push(...parsed.messages);
  return allMessages;
}

export interface RunChatCompletionsParams {
  client: Client;
  output: CommandOutput;
  localize: (text: LocalizedText) => string;
  settings: Settings;
  path: string;
  body: ChatRequest;
  shouldStream: boolean;
  contentMode?: ChatStreamContentMode;
  /** Dry-run payload; defaults to `{ request: body }`. */
  dryRunResult?: unknown;
}

/** Execute a Chat Completions request (dry-run, stream, or JSON). */
export async function runChatCompletions(params: RunChatCompletionsParams): Promise<void> {
  const {
    client,
    output,
    localize,
    settings,
    path,
    body,
    shouldStream,
    contentMode = "delta",
    dryRunResult,
  } = params;
  const format = settings.output;

  if (settings.dryRun) {
    output.result(dryRunResult ?? { request: body });
    return;
  }

  if (shouldStream) {
    const responseStream = await client.request({
      path,
      method: "POST",
      body,
      stream: true,
    });

    let inThinking = false;
    const accumulator = createChatCompletionStreamAccumulator(localize, { contentMode });
    const writesStreamingStdout = format === "text";
    const isTTY = process.stdout.isTTY;
    const statusOut = format === "json" ? process.stderr : isTTY ? process.stdout : process.stderr;
    const resultOut = process.stdout;
    const statusColor = ansi(statusOut);

    for await (const event of parseSSE(responseStream)) {
      const update = accumulator.accept(event);

      if (update.reasoning) {
        if (writesStreamingStdout && !inThinking) {
          inThinking = true;
          statusOut.write(statusColor.dim("Thinking:\n"));
        }
        if (writesStreamingStdout) statusOut.write(update.reasoning);
      }

      if (update.content) {
        if (writesStreamingStdout && inThinking) {
          statusOut.write(`${statusColor.reset}\n\nResponse:\n`);
          inThinking = false;
        }
        if (writesStreamingStdout) resultOut.write(update.content);
      }

      if (accumulator.completed) break;
    }
    if (inThinking) statusOut.write(statusColor.reset);

    output.result(accumulator.finish(), format === "text" ? { text: "" } : undefined);
    return;
  }

  const response = await client.requestJson<ChatResponse>({
    path,
    method: "POST",
    body,
  });
  const text = response.choices?.[0]?.message?.content ?? "";
  output.result(response, format === "text" ? { text } : undefined);
}
