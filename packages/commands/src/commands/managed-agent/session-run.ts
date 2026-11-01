import { defineCommand, type FlagsDef } from "bailian-cli-core";
import { startSessionRun, startSessionRunPolling } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import {
  parseEnvironmentVariables,
  redactEnvironmentVariables,
  ENVIRONMENT_VARIABLE_FLAGS,
} from "./_engine/environment-variables.ts";
import { readSessionResources, SESSION_RESOURCE_FLAGS } from "./_engine/session-resources.ts";
import {
  parseMemoryStores,
  renderCollectedEvents,
  streamAndRenderEvents,
} from "./_engine/session-render.ts";

const SESSION_RUN_FLAGS = {
  ...ENVIRONMENT_VARIABLE_FLAGS,
  ...SESSION_RESOURCE_FLAGS,
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
      "en-US": "Override memory stores with comma-separated YAML keys",
      "zh-CN": "使用逗号分隔的 YAML key 覆盖 Memory Store",
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
  usageArgs:
    "--prompt <text> [--agent <name>] [--no-stream] [--environment_variables <KEY=VALUE>...] [--memory-stores <keys>] [--resource <json|@path>...] [--file <path>]",
  flags: SESSION_RUN_FLAGS,
  exampleArgs: [
    {
      "en-US": '--agent assistant --environment_variables LOG_LEVEL=info --prompt "hello"',
      "zh-CN": '--agent assistant --environment_variables LOG_LEVEL=info --prompt "你好"',
    },
    {
      "en-US":
        '--agent assistant --resource \'{"type":"memory_store","memory_store":"notes","access":"read_only"}\' --prompt "hello"',
      "zh-CN":
        '--agent assistant --resource \'{"type":"memory_store","memory_store":"notes","access":"read_only"}\' --prompt "你好"',
    },
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
  async validate(flags) {
    parseEnvironmentVariables(flags.environment_variables);
    await readSessionResources(flags.resource);
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    const file = flags.file ?? "agents.yaml";
    const environmentVariables = parseEnvironmentVariables(flags.environment_variables);
    const resources = await readSessionResources(flags.resource);

    const runOptions = {
      agent: flags.agent,
      provider: "bailian",
      environment: flags.environment,
      environmentVariables,
      vault: flags.vault,
      memoryStores: parseMemoryStores(flags.memoryStores),
      resources,
      title: flags.title,
    };

    if (settings.dryRun) {
      ctx.output.result({
        would_run: {
          prompt: flags.prompt,
          agent: flags.agent ?? "auto",
          provider: "bailian",
          environment: flags.environment,
          environment_variables: redactEnvironmentVariables(environmentVariables),
          vault: flags.vault,
          memory_stores: runOptions.memoryStores,
          resources,
          title: flags.title,
          mode: flags.noStream ? "polling" : "streaming",
        },
        config_file: file,
      });
      return;
    }

    await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        if (flags.noStream) {
          const run = await startSessionRunPolling(runtime, flags.prompt, runOptions);
          ctx.output.info({
            "en-US": `Session created: ${run.session.id}`,
            "zh-CN": `Session 已创建：${run.session.id}`,
          });
          renderCollectedEvents(ctx, run, {
            session_id: run.session.id,
            provider: run.provider,
            agent: run.agentName,
          });
        } else {
          const run = await startSessionRun(runtime, flags.prompt, runOptions);
          ctx.output.info({
            "en-US": `Session created: ${run.session.id}`,
            "zh-CN": `Session 已创建：${run.session.id}`,
          });
          await streamAndRenderEvents(ctx, run.events, {
            session_id: run.session.id,
            provider: run.provider,
            agent: run.agentName,
          });
        }
      }),
    );
  },
});
