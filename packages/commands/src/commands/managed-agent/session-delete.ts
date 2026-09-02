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
    description: { "en-US": "Session ID (required)", "zh-CN": "Session ID（必填）" },
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
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Delete a session", "zh-CN": "删除 Session" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This deletes the specified remote managed Agent Session.",
      "zh-CN": "该操作会删除指定的远端托管 Agent Session。",
    },
  },
  usageArgs: "--session-id <id> [--provider <name>] [--file <path>]",
  flags: SESSION_DELETE_FLAGS,
  exampleArgs: ["--session-id sess_abc123 --yes"],
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
