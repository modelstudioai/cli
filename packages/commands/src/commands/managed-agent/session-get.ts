import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { getSession } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const SESSION_GET_FLAGS = {
  sessionId: {
    type: "string",
    valueHint: "<id>",
    description: "Session ID (required)",
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
} satisfies FlagsDef;

export default defineCommand({
  description: "Get details of a session",
  auth: "apiKey",
  // Provider-aware gate: only the session's provider needs credentials.
  authOptional: true,
  usageArgs: "--session-id <id> [--provider <name>] [--file <path>]",
  flags: SESSION_GET_FLAGS,
  exampleArgs: ["--session-id sess_abc123"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const session = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: flags.provider ?? "targets",
        });
        return getSession(runtime, flags.sessionId, flags.provider);
      }),
    );

    if (format === "json") {
      emitResult(session, format);
      return;
    }
    emitBare(`  ID:          ${session.id}`);
    emitBare(`  Agent:       ${session.agent_id}`);
    emitBare(`  Environment: ${session.environment_id}`);
    emitBare(`  Status:      ${session.status}`);
    if (session.title) emitBare(`  Title:       ${session.title}`);
    emitBare(`  Created:     ${session.created_at}`);
    emitBare(`  Updated:     ${session.updated_at}`);
  },
});
