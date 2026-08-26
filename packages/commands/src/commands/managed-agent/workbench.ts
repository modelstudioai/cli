import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { launchManagedAgentPlayground } from "./_engine/playground-launcher.ts";

const WORKBENCH_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
  port: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Local port (default: 4848)",
      "zh-CN": "本地端口（默认：4848）",
    },
  },
  noOpen: {
    type: "switch",
    description: {
      "en-US": "Do not open a browser automatically",
      "zh-CN": "不自动打开浏览器",
    },
  },
} satisfies FlagsDef;

const PLAYGROUND_FLAGS = {
  ...WORKBENCH_FLAGS,
  agent: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Agent to preview (required when the project declares multiple Agents)",
      "zh-CN": "要预览的 Agent（项目包含多个 Agent 时需要指定）",
    },
  },
} satisfies FlagsDef;

const WORKBENCH_NOTES = [
  ...CREDENTIALS_NOTE,
  {
    "en-US":
      "Workbench requires Node.js 22+ and starts the shared @openagentpack/playground package locally. Local versions use the shared .openagentpack/versions project store and do not require Git.",
    "zh-CN":
      "Workbench 需要 Node.js 22+，并在本地启动共享的 @openagentpack/playground 包；本地版本使用共享的 .openagentpack/versions 项目版本存储，不依赖 Git。",
  },
];

export const managedAgentWorkbench = defineCommand({
  description: {
    "en-US": "Launch the agents.yaml project Workbench",
    "zh-CN": "启动 agents.yaml 项目 Workbench",
  },
  auth: "apiKey",
  usageArgs: "[--file <path>] [--port <n>] [--no-open]",
  flags: WORKBENCH_FLAGS,
  exampleArgs: ["", "--file agents.yaml --no-open", "--port 4949"],
  notes: WORKBENCH_NOTES,
  async run(ctx) {
    const file = ctx.flags.file ?? "agents.yaml";
    const port = ctx.flags.port ?? 4848;
    if (ctx.settings.dryRun) {
      emitResult(
        {
          would_launch: "workbench",
          config_file: file,
          port,
          open_browser: !ctx.flags.noOpen,
        },
        detectOutputFormat(ctx.settings.output),
      );
      return;
    }
    await launchManagedAgentPlayground({
      file,
      port,
      open: !ctx.flags.noOpen,
      surface: "workbench",
      client: ctx.client,
      settings: ctx.settings,
    });
  },
});

export const managedAgentPlayground = defineCommand({
  description: {
    "en-US": "Launch a Session Preview for an agents.yaml Agent",
    "zh-CN": "为 agents.yaml 中的 Agent 启动会话预览",
  },
  auth: "apiKey",
  usageArgs: "[--file <path>] [--agent <id>] [--port <n>] [--no-open]",
  flags: PLAYGROUND_FLAGS,
  exampleArgs: ["", "--agent assistant", "--file agents.yaml --no-open"],
  notes: WORKBENCH_NOTES,
  async run(ctx) {
    const file = ctx.flags.file ?? "agents.yaml";
    const port = ctx.flags.port ?? 4848;
    if (ctx.settings.dryRun) {
      emitResult(
        {
          would_launch: "playground",
          config_file: file,
          agent: ctx.flags.agent,
          port,
          open_browser: !ctx.flags.noOpen,
        },
        detectOutputFormat(ctx.settings.output),
      );
      return;
    }
    await launchManagedAgentPlayground({
      file,
      agent: ctx.flags.agent,
      port,
      open: !ctx.flags.noOpen,
      surface: "preview",
      client: ctx.client,
      settings: ctx.settings,
    });
  },
});
