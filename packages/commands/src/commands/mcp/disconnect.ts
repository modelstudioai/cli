import { homedir } from "node:os";
import {
  BailianError,
  ExitCode,
  defineCommand,
  detectOutputFormat,
  getConfigDir,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  MCP_AGENT_IDS,
  disconnectMcpAgents,
  resolveMcpAgentTargets,
  type NativeMcpAgent,
} from "./agent-config.ts";

const AGENT_CHOICES = [...MCP_AGENT_IDS, "all"] as const;

const FLAGS = {
  server: {
    type: "string",
    valueHint: "<code>",
    description: {
      "en-US": "Bailian MCP Server Code used during connect",
      "zh-CN": "connect 时使用的百炼 MCP Server Code",
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
    "en-US": "Remove an unchanged MCP registration previously managed by bailian-cli",
    "zh-CN": "移除此前由 bailian-cli 管理且未被修改的 MCP 注册",
  },
  auth: "none",
  usageArgs: "--server <code> --agent <agent|all>",
  flags: FLAGS,
  notes: [
    {
      "en-US": "A registration changed after connect is left untouched and reported as a conflict.",
      "zh-CN": "如果注册项在 connect 后被修改，CLI 会保留该配置并报告冲突。",
    },
  ],
  exampleArgs: [
    "--server TextGenerateImage --agent codex",
    "--server TextGenerateImage --agent all",
  ],
  async run(ctx) {
    const { flags, settings } = ctx;
    const target = flags.agent as NativeMcpAgent | "all";
    const agents = resolveMcpAgentTargets(target, homedir());
    if (agents.length === 0) {
      throw new BailianError(
        "No supported installed Agent was found for --agent all.",
        ExitCode.USAGE,
      );
    }
    const format = detectOutputFormat(settings.output);
    if (settings.dryRun) {
      emitResult({ server: flags.server, agents, action: "disconnect" }, format);
      return;
    }
    const results = disconnectMcpAgents({
      agents,
      name: flags.server,
      home: homedir(),
      configDir: getConfigDir(),
    });
    emitResult({ server: flags.server, results }, format);
  },
});
