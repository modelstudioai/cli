import {
  defineCommand,
  knowledgeChatEndpoint,
  parseSSE,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
  type ParsedFlags,
  type KnowledgeChatContentPart,
  type KnowledgeChatMessage,
  type KnowledgeChatRequest,
  type KnowledgeChatStreamChunk,
} from "bailian-cli-core";
import { ansi, emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const CHAT_FLAGS = {
  message: {
    type: "array",
    valueHint: "<text>",
    description: {
      "en-US":
        "Message text (repeatable). Supports role:content prefix to set role (e.g. user:hello), defaults to user. Follows OpenAI message format",
      "zh-CN":
        "消息文本（可重复）。支持使用 role:content 前缀指定角色（例如 user:hello），默认为 user。遵循 OpenAI 消息格式",
    },
  },
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Q&A service ID (find in console knowledge Q&A page)",
      "zh-CN": "问答服务 ID（可在控制台知识库问答页面查看）",
    },
    required: true,
  },
  // Knowledge APIs use a workspace-specific host, so --workspace-id is a per-command
  // flag here (the console credential scope does not apply).
  ...WORKSPACE_FLAG,
  // Named to avoid the runtime-reserved global --version flag
  agentVersion: {
    type: "string",
    valueHint: "<version>",
    description: {
      "en-US":
        "Service version to call: beta (draft for debugging) or a published number; default is the latest published version",
      "zh-CN": "要调用的服务版本：beta（用于调试的草稿）或已发布版本号；默认使用最新发布版本",
    },
  },
  image: {
    type: "array",
    valueHint: "<url>",
    description: {
      "en-US": "Image URL (repeatable). Attached to the last user message as multimodal content",
      "zh-CN": "图片 URL（可重复）。将作为多模态内容附加到最后一条用户消息",
    },
  },
} satisfies FlagsDef;
type ChatFlags = ParsedFlags<typeof CHAT_FLAGS>;

/**
 * Parse --message flags into KnowledgeChatMessage[].
 * Supports:
 *   1. Simple text: "hello" → {role:"user", content:"hello"}
 *   2. Role prefix: "user:hello" / "assistant:hi" → {role, content}
 *   3. JSON object: '{"role":"user","content":[...]}' → structured message (advanced)
 */
function parseMessages(flags: ChatFlags): KnowledgeChatMessage[] {
  const messages: KnowledgeChatMessage[] = [];
  if (flags.message) {
    const validRoles = new Set(["user", "assistant"]);
    for (const m of flags.message) {
      // Try JSON object first (advanced usage)
      if (m.startsWith("{")) {
        try {
          const parsed = JSON.parse(m) as { role?: string; content?: unknown };
          if (parsed.role && validRoles.has(parsed.role) && parsed.content !== undefined) {
            messages.push(parsed as KnowledgeChatMessage);
            continue;
          }
        } catch {
          // Not valid JSON, fall through to simple parsing
        }
      }

      // Simple role:content or plain text
      const colonIdx = m.indexOf(":");
      const maybeRole = colonIdx !== -1 ? m.slice(0, colonIdx) : "";

      if (validRoles.has(maybeRole)) {
        messages.push({ role: maybeRole as "user" | "assistant", content: m.slice(colonIdx + 1) });
      } else {
        messages.push({ role: "user", content: m });
      }
    }
  }
  return messages;
}

/** Check if any message content already contains image_url parts */
function hasEmbeddedImages(messages: KnowledgeChatMessage[]): boolean {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      if (msg.content.some((p) => p.type === "image_url")) return true;
    }
  }
  return false;
}

/** Attach --image URLs to the last user message's content (as multimodal array) */
function attachImagesToLastUserMessage(
  messages: KnowledgeChatMessage[],
  imageUrls: string[],
): void {
  // Find last user message index
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  // If no user message exists, append an empty one
  if (lastUserIdx === -1) {
    messages.push({ role: "user", content: "" });
    lastUserIdx = messages.length - 1;
  }

  const target = messages[lastUserIdx]!;
  const contentParts: KnowledgeChatContentPart[] = [];

  // Preserve existing text content (always include a text part, even if empty)
  if (typeof target.content === "string") {
    contentParts.push({ type: "text", text: target.content });
  } else {
    // Already an array, extend it
    contentParts.push(...target.content);
  }

  // Append image parts
  for (const url of imageUrls) {
    contentParts.push({ type: "image_url", image_url: { url } });
  }

  target.content = contentParts;
}

/** SSE step_change → human-friendly progress label (TTY only) */
const STEP_LABELS: Record<string, string> = {
  tool_calling: "🔍 Retrieving...",
  plan_start: "🤔 Planning...",
  generation_start: "✍️ Generating...",
};

export default defineCommand({
  description: {
    "en-US": "Chat with a Bailian knowledge base (RAG Q&A with streaming)",
    "zh-CN": "与百炼知识库对话（支持流式输出的 RAG 问答）",
  },
  auth: "apiKey",
  usageArgs: "--message <text> --agent-id <id> [flags]",
  flags: CHAT_FLAGS,
  notes: [
    {
      "en-US":
        "Response is returned as SSE stream events. Event lifecycle: tool_calling → tool_return → plan_start → planning → plan_end → generation_start → generating → generation_end. tool_calling → tool_return may loop multiple times.",
      "zh-CN":
        "响应以 SSE 流事件返回。事件生命周期：tool_calling → tool_return → plan_start → planning → plan_end → generation_start → generating → generation_end。tool_calling → tool_return 可能循环多次。",
    },
    {
      "en-US":
        "Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.",
      "zh-CN": "鉴权：使用 DashScope API Key（Bearer Token）。可在控制台 API Key 页面获取。",
    },
    {
      "en-US":
        "`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.",
      "zh-CN":
        "`--workspace-id` 可通过 BAILIAN_WORKSPACE_ID 环境变量或 `kscli config set workspace_id <id>` 设置。",
    },
    {
      "en-US":
        'Multi-turn: use --message "user:..." and --message "assistant:..." to pass conversation history.',
      "zh-CN": '多轮对话：使用 --message "user:..." 和 --message "assistant:..." 传入对话历史。',
    },
    {
      "en-US": "`--agent-version beta` calls the draft config for debugging before it is deployed.",
      "zh-CN": "`--agent-version beta` 会调用尚未部署的草稿配置，便于发布前调试。",
    },
  ],
  exampleArgs: [
    {
      "en-US": '--message "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx',
      "zh-CN": '--message "什么是 RAG？" --agent-id aid-xxx --workspace-id ws-xxx',
    },
    {
      "en-US":
        '--message "user:What is RAG?" --message "assistant:RAG is..." --message "How does it work?" --agent-id aid-xxx --workspace-id ws-xxx',
      "zh-CN":
        '--message "user:什么是 RAG？" --message "assistant:RAG 是……" --message "它是如何工作的？" --agent-id aid-xxx --workspace-id ws-xxx',
    },
    {
      "en-US":
        '--message "Describe these images" --image https://example.com/a.png --image https://example.com/b.png --agent-id aid-xxx --workspace-id ws-xxx',
      "zh-CN":
        '--message "描述这些图片" --image https://example.com/a.png --image https://example.com/b.png --agent-id aid-xxx --workspace-id ws-xxx',
    },
  ],
  validate: (f) =>
    (f.message && f.message.length > 0) || (f.image && f.image.length > 0)
      ? undefined
      : "Provide --message (or --image for a pure image query).",
  async run(ctx) {
    const { settings, flags } = ctx;
    let messages = parseMessages(flags);

    const imageUrls = flags.image;
    const hasImages = !!imageUrls && imageUrls.length > 0;

    // --image without --message: create an empty user message to hold images
    if (messages.length === 0 && hasImages) {
      messages = [{ role: "user", content: "" }];
    }

    const workspaceId = resolveWorkspaceId(ctx);

    const format = detectOutputFormat(settings.output);
    // API only supports SSE; streamOutput controls whether to print tokens in real-time
    const streamOutput = format === "text" && !!process.stdout.isTTY;

    // Attach --image URLs to messages (multimodal content array)
    if (hasImages) {
      if (hasEmbeddedImages(messages)) {
        throw new BailianError(
          "Cannot use --image when messages already contain embedded image_url content parts. Use one approach or the other.",
          ExitCode.USAGE,
        );
      }
      attachImagesToLastUserMessage(messages, imageUrls);
    }

    const body: KnowledgeChatRequest = {
      input: {
        messages,
      },
      parameters: {
        agent_options: {
          agent_id: flags.agentId,
          // Omitted flag → field not sent (default behavior unchanged); the value is
          // not validated — the set of versions is server-side state
          ...(flags.agentVersion ? { agent_version: flags.agentVersion } : {}),
        },
      },
      stream: true,
    };

    const url = knowledgeChatEndpoint(workspaceId);

    if (settings.dryRun) {
      emitResult({ endpoint: url, request: body }, format);
      return;
    }

    const res = await ctx.client.request({
      path: url,
      method: "POST",
      body,
      stream: true,
    });

    if (streamOutput) {
      const color = ansi(process.stdout);
      const verbose = settings.verbose;

      for await (const event of parseSSE(res)) {
        if (event.data === "[DONE]") break;

        if (event.event === "error") {
          let errMsg = "Chat API error";
          let errCode: string | undefined;
          try {
            const err = JSON.parse(event.data);
            errMsg = err.message || errMsg;
            errCode = err.code;
          } catch {
            /* use defaults */
          }
          throw new BailianError(
            errMsg,
            ExitCode.GENERAL,
            errCode ? `API error: ${errCode}` : undefined,
          );
        }

        try {
          const chunk = JSON.parse(event.data) as KnowledgeChatStreamChunk;

          for (const choice of chunk.output?.choices ?? []) {
            const msg = choice.message;

            // Progress indicator (TTY text mode)
            if (msg.extra?.step_change) {
              const label = STEP_LABELS[msg.extra.step_change];
              if (label) {
                process.stdout.write(`${color.dim(label)}\n`);
              }
            }

            // Verbose: dump all events to stderr
            if (verbose && msg.extra?.step_change) {
              process.stderr.write(
                ansi(process.stderr).dim(
                  `[event] step_change=${msg.extra.step_change} step=${msg.extra?.step ?? ""} group=${msg.extra?.group ?? ""}`,
                ) + "\n",
              );
            }

            // Extract generated content
            if (msg.content) {
              process.stdout.write(msg.content);
            }

            if (choice.finish_reason === "stop") break;
          }
        } catch {
          // Skip unparseable chunks
        }
      }

      process.stdout.write("\n");
    } else {
      // Buffered output: collect all chunks then emit
      let textContent = "";
      let requestId = "";

      for await (const event of parseSSE(res)) {
        if (event.data === "[DONE]") break;

        if (event.event === "error") {
          let errMsg = "Chat API error";
          let errCode: string | undefined;
          try {
            const err = JSON.parse(event.data);
            errMsg = err.message || errMsg;
            errCode = err.code;
          } catch {
            /* use defaults */
          }
          throw new BailianError(
            errMsg,
            ExitCode.GENERAL,
            errCode ? `API error: ${errCode}` : undefined,
          );
        }

        try {
          const chunk = JSON.parse(event.data) as KnowledgeChatStreamChunk;
          if (chunk.request_id) requestId = chunk.request_id;

          for (const choice of chunk.output?.choices ?? []) {
            if (choice.message?.content) {
              textContent += choice.message.content;
            }
            if (choice.finish_reason === "stop") break;
          }
        } catch {
          // Skip unparseable chunks
        }
      }

      if (settings.quiet || format === "text") {
        emitBare(textContent);
      } else {
        emitResult({ answer: textContent, request_id: requestId }, format);
      }
    }
  },
});
