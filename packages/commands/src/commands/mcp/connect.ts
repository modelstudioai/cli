import { homedir } from "node:os";
import {
  BailianError,
  ExitCode,
  REGIONS,
  bailianMcpPath,
  bailianMcpSsePath,
  defineCommand,
  detectOutputFormat,
  getConfigDir,
  trackingHeaders,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  MCP_AGENT_IDS,
  connectMcpAgents,
  resolveMcpAgentTargets,
  type McpTransport,
  type NativeMcpAgent,
} from "./agent-config.ts";

const AGENT_CHOICES = [...MCP_AGENT_IDS, "all"] as const;
const TRANSPORT_CHOICES = ["streamable-http", "sse"] as const;

const FLAGS = {
  server: {
    type: "string",
    valueHint: "<code>",
    description: {
      "en-US": "Bailian MCP Server Code, such as TextGenerateImage",
      "zh-CN": "百炼 MCP Server Code，例如 TextGenerateImage",
    },
    required: true,
  },
  transport: {
    type: "string",
    valueHint: "<transport>",
    choices: TRANSPORT_CHOICES,
    description: {
      "en-US": "MCP transport exposed by the server: streamable-http or sse",
      "zh-CN": "服务端提供的 MCP 传输协议：streamable-http 或 sse",
    },
    required: true,
  },
  agent: {
    type: "string",
    valueHint: "<agent>",
    choices: AGENT_CHOICES,
    description: {
      "en-US": `Target Agent: ${AGENT_CHOICES.join(", ")}`,
      "zh-CN": `目标 Agent：${AGENT_CHOICES.join(", ")}`,
    },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Register a Bailian MCP server in an Agent's native configuration",
    "zh-CN": "将百炼 MCP 服务注册到 Agent 的原生配置中",
  },
  auth: "apiKey",
  usageArgs: "--server <code> --transport <streamable-http|sse> --agent <agent|all>",
  flags: FLAGS,
  notes: [
    {
      "en-US":
        "This release registers the official China-site MCP endpoint; the model API --base-url does not change the MCP endpoint.",
      "zh-CN": "本期固定注册中国站官方 MCP 地址；模型 API 的 --base-url 不会改变 MCP 地址。",
    },
    {
      "en-US":
        "The resolved API key is written to the selected Agent's private local configuration. Existing unmanaged entries are never overwritten.",
      "zh-CN": "解析出的 API Key 会写入所选 Agent 的本地私有配置；CLI 不会覆盖非其管理的同名条目。",
    },
  ],
  exampleArgs: [
    "--server TextGenerateImage --transport streamable-http --agent codex",
    "--server VideoGenerate --transport sse --agent claude-code",
    "--server TextGenerateImage --transport streamable-http --agent all",
  ],
  async run(ctx) {
    const { flags, settings } = ctx;
    const transport = flags.transport as McpTransport;
    const target = flags.agent as NativeMcpAgent | "all";
    const agents = resolveMcpAgentTargets(target, homedir());
    if (agents.length === 0) {
      throw new BailianError(
        "No supported installed Agent was found for --agent all.",
        ExitCode.USAGE,
      );
    }

    const endpointPath =
      transport === "sse" ? bailianMcpSsePath(flags.server) : bailianMcpPath(flags.server);
    const endpoint = `${REGIONS.cn}${endpointPath}`;
    const channelHeaders = trackingHeaders(ctx.identity);
    const headerNames = ["Authorization", ...Object.keys(channelHeaders)];
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          server: flags.server,
          transport,
          endpoint,
          agents,
          header_names: headerNames,
        },
        format,
      );
      return;
    }

    const results = connectMcpAgents({
      agents,
      spec: {
        name: flags.server,
        serverCode: flags.server,
        transport,
        endpoint,
        headers: ctx.client.bailianMcpRegistrationHeaders(),
      },
      cliVersion: ctx.identity.version,
      home: homedir(),
      configDir: getConfigDir(),
    });

    emitResult({ server: flags.server, transport, endpoint, results }, format);
  },
});
