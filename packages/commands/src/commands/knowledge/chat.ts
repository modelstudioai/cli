import {
  defineCommand,
  request,
  knowledgeChatEndpoint,
  parseSSE,
  detectOutputFormat,
  BailianError,
  ExitCode,
  isInteractive,
  type Config,
  type GlobalFlags,
  type KnowledgeChatRequest,
  type KnowledgeChatStreamChunk,
} from "bailian-cli-core";
import { failIfMissing, cmdUsage, emitResult, emitBare, promptText } from "bailian-cli-runtime";

interface ParsedMessage {
  role: "user" | "assistant";
  content: string;
}

function parseMessages(flags: GlobalFlags): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  if (flags.message) {
    const validRoles = new Set(["user", "assistant"]);
    const msgs = flags.message as string[];
    for (const m of msgs) {
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

/** SSE step_change → human-friendly progress label (TTY only) */
const STEP_LABELS: Record<string, string> = {
  tool_calling: "🔍 Retrieving...",
  plan_start: "🤔 Planning...",
  generation_start: "✍️ Generating...",
};

export default defineCommand({
  description: "Chat with a Bailian knowledge base (RAG Q&A with streaming)",
  usageArgs: "--message <text> --agent-id <id> [flags]",
  options: [
    {
      flag: "--message <text>",
      description:
        "Message text (repeatable). Supports role:content prefix to set role (e.g. user:hello), defaults to user. Follows OpenAI message format",
      required: true,
      type: "array",
    },
    {
      flag: "--agent-id <id>",
      description: "Q&A service ID (find in console knowledge Q&A page)",
      required: true,
    },
    {
      flag: "--workspace-id <id>",
      description: "Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)",
    },
    {
      flag: "--image <url>",
      description: "Image URL(s) (repeatable)",
      type: "array",
    },
  ],
  notes: [
    "Response is returned as SSE stream events. Event lifecycle: tool_calling → tool_return → plan_start → planning → plan_end → generation_start → generating → generation_end. tool_calling → tool_return may loop multiple times.",
    "Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.",
    "`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.",
    'Multi-turn: use --message "user:..." and --message "assistant:..." to pass conversation history.',
  ],
  exampleArgs: [
    '--message "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx',
    '--message "user:What is RAG?" --message "assistant:RAG is..." --message "How does it work?" --agent-id aid-xxx --workspace-id ws-xxx',
  ],
  async run(config: Config, flags: GlobalFlags) {
    let messages = parseMessages(flags);

    if (messages.length === 0) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: "Enter your message:" });
        if (!hint) {
          process.stderr.write("Chat cancelled.\n");
          process.exit(1);
        }
        messages = [{ role: "user", content: hint }];
      } else {
        failIfMissing("message", cmdUsage(config, "--message <text> --agent-id <id>"));
      }
    }

    const agentId = flags.agentId as string;
    if (!agentId) failIfMissing("agent-id", cmdUsage(config, "--message <text> --agent-id <id>"));

    const workspaceId = (flags.workspaceId as string) || config.workspaceId;
    if (!workspaceId) {
      throw new BailianError(
        "Workspace ID is required.",
        ExitCode.USAGE,
        "Pass --workspace-id, set BAILIAN_WORKSPACE_ID env, or configure: kscli config set workspace_id <id>",
      );
    }

    const format = detectOutputFormat(config.output);
    // API only supports SSE; streamOutput controls whether to print tokens in real-time
    const streamOutput = format === "text" && !!process.stdout.isTTY;

    const body: KnowledgeChatRequest = {
      input: {
        messages,
      },
      parameters: {
        agent_options: {
          agent_id: agentId,
        },
      },
      stream: true,
    };

    const imageUrls = flags.image as string[] | undefined;
    if (imageUrls && imageUrls.length > 0) {
      body.parameters.agent_options.image_list = imageUrls;
    }

    const url = knowledgeChatEndpoint(workspaceId);

    if (config.dryRun) {
      emitResult({ endpoint: url, request: body }, format);
      return;
    }

    const res = await request(config, {
      url,
      method: "POST",
      body,
      stream: true,
    });

    if (streamOutput) {
      let textContent = "";
      const dim = config.noColor ? "" : "\x1b[2m";
      const reset = config.noColor ? "" : "\x1b[0m";
      const verbose = config.verbose;

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
                process.stdout.write(`${dim}${label}${reset}\n`);
              }
            }

            // Verbose: dump all events to stderr
            if (verbose && msg.extra?.step_change) {
              process.stderr.write(
                `${dim}[event] step_change=${msg.extra.step_change} step=${msg.extra?.step ?? ""} group=${msg.extra?.group ?? ""}${reset}\n`,
              );
            }

            // Extract generated content
            if (msg.content) {
              textContent += msg.content;
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

      if (config.quiet || format === "text") {
        emitBare(textContent);
      } else {
        emitResult({ answer: textContent, request_id: requestId }, format);
      }
    }
  },
});
