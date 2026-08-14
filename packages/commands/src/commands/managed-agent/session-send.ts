import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { sendSessionMessagePolling, sendSessionMessageStreaming } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { renderCollectedEvents, streamAndRenderEvents } from "./_engine/session-render.ts";

const SESSION_SEND_FLAGS = {
  sessionId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Session ID (required)", "zh-CN": "Session ID（必填）" },
    required: true,
  },
  message: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Message to send (required)", "zh-CN": "要发送的消息（必填）" },
    required: true,
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Target provider", "zh-CN": "目标 Provider" },
  },
  noStream: {
    type: "switch",
    description: {
      "en-US": "Use polling instead of SSE streaming",
      "zh-CN": "使用轮询代替 SSE 流式传输",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Send a message to an existing session and stream the response",
    "zh-CN": "向已有 Session 发送消息并流式输出响应",
  },
  auth: "apiKey",
  usageArgs: "--session-id <id> --message <text> [--no-stream] [--file <path>]",
  flags: SESSION_SEND_FLAGS,
  exampleArgs: [
    {
      "en-US": '--session-id sess_abc123 --message "continue"',
      "zh-CN": '--session-id sess_abc123 --message "继续"',
    },
  ],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";
    const asJson = format === "json";

    if (settings.dryRun) {
      emitResult(
        {
          would_send: {
            session_id: flags.sessionId,
            message: flags.message,
            provider: flags.provider ?? "auto",
            mode: flags.noStream ? "polling" : "streaming",
          },
          config_file: file,
        },
        format,
      );
      return;
    }

    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        if (flags.noStream) {
          const result = await sendSessionMessagePolling(runtime, flags.sessionId, flags.message, {
            provider: flags.provider,
          });
          renderCollectedEvents(result, asJson, {
            session_id: flags.sessionId,
          });
        } else {
          const events = await sendSessionMessageStreaming(
            runtime,
            flags.sessionId,
            flags.message,
            {
              provider: flags.provider,
            },
          );
          await streamAndRenderEvents(events, asJson, {
            session_id: flags.sessionId,
          });
        }
      }),
    );
  },
});
