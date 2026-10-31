import { defineCommand, type FlagsDef } from "bailian-cli-core";
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
    const { flags } = ctx;

    const file = flags.file ?? "agents.yaml";

    const session = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        return getSession(runtime, flags.sessionId, "bailian");
      }),
    );

    ctx.output.result(session, {
      text:
        ctx.settings.output === "text"
          ? (() => {
              const lines: string[] = [];
              lines.push(`  ID:          ${session.id}`);
              lines.push(`  Agent:       ${session.agent_id}`);
              lines.push(`  Environment: ${session.environment_id}`);
              lines.push(`  Status:      ${session.status}`);
              if (session.title) lines.push(`  Title:       ${session.title}`);
              lines.push(`  Created:     ${session.created_at}`);
              lines.push(`  Updated:     ${session.updated_at}`);
              return lines.join("\n");
            })()
          : undefined,
    });
  },
});
