import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { createSessionForAgent } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { parseMemoryStores } from "./_engine/session-render.ts";

const SESSION_CREATE_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
  agent: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Agent name (auto-detected when only one agent is configured)",
      "zh-CN": "Agent 名称（仅配置一个 Agent 时自动识别）",
    },
  },
  environment: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Override agent's declared environment",
      "zh-CN": "覆盖 Agent 声明的环境",
    },
  },
  vault: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Override agent's declared vault", "zh-CN": "覆盖 Agent 声明的 Vault" },
  },
  memoryStores: {
    type: "string",
    valueHint: "<names>",
    description: {
      "en-US": "Override agent's memory stores (comma-separated)",
      "zh-CN": "覆盖 Agent 的 Memory Store（以逗号分隔）",
    },
  },
  title: {
    type: "string",
    valueHint: "<title>",
    description: { "en-US": "Session title", "zh-CN": "Session 标题" },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Create a new session for an agent", "zh-CN": "为 Agent 创建新 Session" },
  auth: "apiKey",
  usageArgs: "[--agent <name>] [--environment <name>] [--title <title>] [--file <path>]",
  flags: SESSION_CREATE_FLAGS,
  exampleArgs: [
    "",
    "--agent assistant",
    {
      "en-US": "--agent assistant --title 'debug run'",
      "zh-CN": "--agent assistant --title '调试运行'",
    },
  ],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    if (settings.dryRun) {
      emitResult(
        {
          would_create_session: {
            agent: flags.agent ?? "auto",
            provider: "bailian",
            environment: flags.environment,
            vault: flags.vault,
            memory_stores: parseMemoryStores(flags.memoryStores),
            title: flags.title,
          },
          config_file: file,
        },
        format,
      );
      return;
    }

    const run = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        return createSessionForAgent(runtime, {
          agent: flags.agent,
          provider: "bailian",
          environment: flags.environment,
          vault: flags.vault,
          memoryStores: parseMemoryStores(flags.memoryStores),
          title: flags.title,
        });
      }),
    );

    const { agentName, session } = run;
    if (format === "json") {
      emitResult({ agent: agentName, session }, format);
      return;
    }
    emitBare(`Session created: ${session.id}`);
    emitBare(`  Agent:       ${agentName}`);
    emitBare(`  Environment: ${session.environment_id}`);
    emitBare(`  Status:      ${session.status}`);
    if (session.vault_ids.length) emitBare(`  Vaults:      ${session.vault_ids.join(", ")}`);
    if (session.memory_store_ids.length) {
      emitBare(`  Memory:      ${session.memory_store_ids.join(", ")}`);
    }
  },
});
