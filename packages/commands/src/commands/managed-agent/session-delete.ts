import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { deleteSession } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const SESSION_DELETE_FLAGS = {
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
  description: "Delete a session",
  auth: "apiKey",
  usageArgs: "--session-id <id> [--provider <name>] [--file <path>]",
  flags: SESSION_DELETE_FLAGS,
  exampleArgs: ["--session-id sess_abc123"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    if (settings.dryRun) {
      emitResult(
        {
          would_delete_session: flags.sessionId,
          provider: flags.provider ?? "auto",
          config_file: file,
        },
        format,
      );
      return;
    }

    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        await deleteSession(runtime, flags.sessionId, flags.provider);
      }),
    );

    if (format === "json") emitResult({ deleted: flags.sessionId }, format);
    else emitBare(`Session ${flags.sessionId} deleted.`);
  },
});
