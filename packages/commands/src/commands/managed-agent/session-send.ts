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
    description: "Session ID (required)",
    required: true,
  },
  message: {
    type: "string",
    valueHint: "<text>",
    description: "Message to send (required)",
    required: true,
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: "Target provider",
  },
  noStream: {
    type: "switch",
    description: "Use polling instead of SSE streaming",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Send a message to an existing session and stream the response",
  auth: "apiKey",
  // Provider-aware gate: only the session's provider needs credentials.
  authOptional: true,
  usageArgs: "--session-id <id> --message <text> [--no-stream] [--file <path>]",
  flags: SESSION_SEND_FLAGS,
  exampleArgs: ['--session-id sess_abc123 --message "continue"'],
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
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: flags.provider ?? "targets",
        });
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
