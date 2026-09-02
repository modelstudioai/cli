import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { startSessionRun, startSessionRunPolling } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import {
  parseMemoryStores,
  renderCollectedEvents,
  streamAndRenderEvents,
} from "./_engine/session-render.ts";

const SESSION_RUN_FLAGS = {
  prompt: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Prompt to send (required)", "zh-CN": "要发送的 Prompt（必填）" },
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
    "en-US": "Create a session, send a message, and stream the response",
    "zh-CN": "创建 Session、发送消息并流式输出响应",
  },
  auth: "apiKey",
  usageArgs: "--prompt <text> [--agent <name>] [--no-stream] [--file <path>]",
  flags: SESSION_RUN_FLAGS,
  exampleArgs: [
    {
      "en-US": '--prompt "hello"',
      "zh-CN": '--prompt "你好"',
    },
    {
      "en-US": '--agent assistant --prompt "summarize this repo"',
      "zh-CN": '--agent assistant --prompt "总结这个代码仓库"',
    },
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US":
        "--output json emits one envelope: { session_id, provider, agent, events } — read session_id to chain `session send/get/events/delete`.",
      "zh-CN":
        "--output json 输出一个 Envelope：{ session_id, provider, agent, events }。读取 session_id 后可串联调用 `session send/get/events/delete`。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";
    const asJson = format === "json";

    const runOptions = {
      agent: flags.agent,
      provider: "bailian",
      environment: flags.environment,
      vault: flags.vault,
      memoryStores: parseMemoryStores(flags.memoryStores),
      title: flags.title,
    };

    if (settings.dryRun) {
      emitResult(
        {
          would_run: {
            prompt: flags.prompt,
            agent: flags.agent ?? "auto",
            provider: "bailian",
            environment: flags.environment,
            vault: flags.vault,
            memory_stores: runOptions.memoryStores,
            title: flags.title,
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
          const run = await startSessionRunPolling(runtime, flags.prompt, runOptions);
          if (!asJson) process.stderr.write(`Session created: ${run.session.id}\n`);
          renderCollectedEvents(run, asJson, {
            session_id: run.session.id,
            provider: run.provider,
            agent: run.agentName,
          });
        } else {
          const run = await startSessionRun(runtime, flags.prompt, runOptions);
          if (!asJson) process.stderr.write(`Session created: ${run.session.id}\n`);
          await streamAndRenderEvents(run.events, asJson, {
            session_id: run.session.id,
            provider: run.provider,
            agent: run.agentName,
          });
        }
      }),
    );
  },
});
