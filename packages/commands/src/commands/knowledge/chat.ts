import { readFileSync } from "node:fs";
import { createChatAccumulator } from "./chat-events.ts";
import { mediaSummary } from "./media-output.ts";
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
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const CHAT_FLAGS = {
  messagesFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Complete messages JSON array, including tool history (excludes --message/--image)",
      "zh-CN": "完整 messages JSON 数组，支持工具历史（与 --message/--image 互斥）",
    },
  },
  sessionFileId: {
    type: "array",
    valueHint: "<fileId>",
    description: {
      "en-US": "Session file ID (repeatable, up to 10; requires service file preprocessing)",
      "zh-CN": "会话文件 ID（可重复，最多 10 个；服务需开启文件预解析）",
    },
  },
  enableCacheControl: {
    type: "boolean",
    valueHint: "<true|false>",
    description: { "en-US": "Explicit context cache control", "zh-CN": "显式上下文缓存开关" },
  },
  requestId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Business request ID", "zh-CN": "业务请求 ID" },
  },
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
    const validRoles = new Set(["user", "assistant", "tool"]);
    for (const message of flags.message) {
      // Try JSON object first (advanced usage)
      if (message.startsWith("{")) {
        try {
          const parsed = JSON.parse(message) as { role?: string; content?: unknown };
          if (parsed.role && validRoles.has(parsed.role) && parsed.content !== undefined) {
            messages.push(parsed as KnowledgeChatMessage);
            continue;
          }
        } catch {
          // Not valid JSON, fall through to simple parsing
        }
      }

      // Simple role:content or plain text
      const colonIdx = message.indexOf(":");
      const maybeRole = colonIdx !== -1 ? message.slice(0, colonIdx) : "";

      if (validRoles.has(maybeRole)) {
        messages.push({
          role: maybeRole as KnowledgeChatMessage["role"],
          content: message.slice(colonIdx + 1),
        });
      } else {
        messages.push({ role: "user", content: message });
      }
    }
  }
  return messages;
}

/** Check if any message content already contains image_url parts */
function hasEmbeddedImages(messages: KnowledgeChatMessage[]): boolean {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      if (msg.content.some((part) => part.type === "image_url")) return true;
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
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    if (messages[messageIndex]!.role === "user") {
      lastUserIdx = messageIndex;
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
  validate(flags) {
    if (flags.messagesFile && (flags.message?.length || flags.image?.length))
      return {
        "en-US": "--messages-file cannot be combined with --message or --image.",
        "zh-CN": "--messages-file 不能与 --message 或 --image 同时使用。",
      };
    if (!flags.messagesFile && !flags.message?.length && !flags.image?.length)
      return {
        "en-US": "Provide --message, --messages-file or --image.",
        "zh-CN": "请提供 --message、--messages-file 或 --image。",
      };
    if (
      flags.sessionFileId &&
      (flags.sessionFileId.length > 10 || flags.sessionFileId.some((fileId) => !fileId.trim()))
    )
      return {
        "en-US": "--session-file-id accepts up to 10 nonempty IDs.",
        "zh-CN": "--session-file-id 最多接受 10 个非空 ID。",
      };
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    let messages = parseMessages(flags);
    if (flags.messagesFile !== undefined) {
      const raw = readFileSync(flags.messagesFile, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new BailianError(
          ctx.localize({
            "en-US": "--messages-file must contain valid JSON.",
            "zh-CN": "--messages-file 必须包含合法 JSON。",
          }),
          ExitCode.USAGE,
        );
      }
      if (
        !Array.isArray(parsed) ||
        parsed.length === 0 ||
        parsed.some((entry: unknown) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
          const message = entry as Record<string, unknown>;
          return (
            !["user", "assistant", "tool"].includes(
              typeof message.role === "string" ? message.role : "",
            ) ||
            !(typeof message.content === "string" || Array.isArray(message.content)) ||
            (message.role === "tool" &&
              (typeof message.tool_call_id !== "string" || !message.tool_call_id.trim()))
          );
        })
      )
        throw new BailianError(
          ctx.localize({
            "en-US":
              "--messages-file must be a nonempty message array with user/assistant/tool roles and content; tool messages require tool_call_id.",
            "zh-CN":
              "--messages-file 必须为非空消息数组，包含 user/assistant/tool 角色和 content；工具消息必须包含 tool_call_id。",
          }),
          ExitCode.USAGE,
        );
      messages = parsed as KnowledgeChatMessage[];
    }

    const imageUrls = flags.image;
    const hasImages = !!imageUrls && imageUrls.length > 0;

    // --image without --message: create an empty user message to hold images
    if (messages.length === 0 && hasImages) {
      messages = [{ role: "user", content: "" }];
    }

    const workspaceId = resolveWorkspaceId(ctx);

    const format = detectOutputFormat(settings.output);
    // API only supports SSE; streamOutput controls whether to print tokens in real-time
    const streamOutput = !settings.quiet && format === "text" && !!process.stdout.isTTY;

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
        ...(flags.requestId !== undefined ? { request_id: flags.requestId } : {}),
      },
      parameters: {
        agent_options: {
          agent_id: flags.agentId,
          ...(flags.sessionFileId ? { session_files: flags.sessionFileId } : {}),
          ...(flags.enableCacheControl !== undefined
            ? { enable_cache_control: flags.enableCacheControl }
            : {}),
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

    const accumulator = createChatAccumulator(ctx.localize);
    let displayedStage = "";
    for await (const event of parseSSE(res)) {
      if (settings.verbose) process.stderr.write(`[event] ${event.event ?? "message"}\n`);
      const fragments = accumulator.accept(event);
      if (streamOutput) {
        for (const fragment of fragments) {
          if (fragment.stage !== displayedStage) {
            if (displayedStage) process.stdout.write("\n");
            const labels: Record<string, { "en-US": string; "zh-CN": string }> = {
              planning: { "en-US": "Planning", "zh-CN": "规划" },
              tool_calling: { "en-US": "Tools", "zh-CN": "工具" },
              generating: { "en-US": "Answer", "zh-CN": "回答" },
              unknown: { "en-US": "Other events", "zh-CN": "其他事件" },
            };
            process.stdout.write(`[${ctx.localize(labels[fragment.stage] ?? labels.unknown!)}]\n`);
            displayedStage = fragment.stage;
          }
          process.stdout.write(fragment.content);
        }
      }
      if (event.data === "[DONE]") break;
    }
    const result = accumulator.finish();
    if (settings.quiet) emitBare(result.answer);
    else if (format !== "text") emitResult(result, format);
    else if (!streamOutput) emitBare(result.answer);
    else {
      process.stdout.write("\n");
      if (result.docs.length) emitBare(ctx.localize({ "en-US": "Sources:", "zh-CN": "来源：" }));
      for (const doc of result.docs) {
        if (doc === null || typeof doc !== "object" || Array.isArray(doc)) continue;
        const record = doc as Record<string, unknown>;
        const metadata =
          record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
            ? (record.metadata as Record<string, unknown>)
            : record;
        emitBare(
          JSON.stringify({
            doc_id: metadata.doc_id,
            title: metadata.title,
            citation: metadata._citation_index,
          }),
        );
        for (const line of mediaSummary(metadata)) emitBare(line);
      }
    }
  },
});
