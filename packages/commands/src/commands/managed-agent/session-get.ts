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
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Get details of a session", "zh-CN": "获取 Session 详情" },
  auth: "apiKey",
  usageArgs: "--session-id <id> [--file <path>]",
  flags: SESSION_GET_FLAGS,
  exampleArgs: ["--session-id sess_abc123"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const session = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        return getSession(runtime, flags.sessionId, "bailian");
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
