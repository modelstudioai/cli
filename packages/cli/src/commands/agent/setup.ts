import { platform } from "os";
import {
  defineCommand,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { AGENTS, VALID_AGENT_NAMES, type WriteParams } from "./writers.ts";

export default defineCommand({
  name: "agent setup",
  description: "Configure a coding agent to use DashScope API",
  skipDefaultApiKeySetup: true,
  usage: "bl agent setup --agent <name> --base-url <url> --api-key <key> --model <model>",
  options: [
    {
      flag: "--agent <name>",
      description: `Target agent: ${VALID_AGENT_NAMES.join(", ")}`,
    },
    { flag: "--base-url <url>", description: "API base URL" },
    { flag: "--api-key <key>", description: "API key" },
    { flag: "--model <model>", description: "Default model name" },
  ],
  examples: [
    "npx bailian-cli agent setup --agent claude-code --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3.7-max",
    "npx bailian-cli agent setup --agent qwen-code --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3.6-plus",
    "npx bailian-cli agent setup --agent opencode --base-url https://dashscope.aliyuncs.com/apps/anthropic/v1 --api-key sk-xxxxx --model qwen3.7-max",
    "npx bailian-cli agent setup --agent openclaw --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3.6-plus",
    "npx bailian-cli agent setup --agent hermes --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3.7-max",
    "npx bailian-cli agent setup --agent codex --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3.7-max",
  ],
  async run(_config: Config, flags: GlobalFlags) {
    const agent = flags.agent as string | undefined;
    const baseUrl = flags.baseUrl as string | undefined;
    const apiKey = flags.apiKey as string | undefined;
    const model = flags.model as string | undefined;

    if (!agent || !baseUrl || !apiKey || !model) {
      throw new BailianError(
        "All flags are required: --agent, --base-url, --api-key, --model",
        ExitCode.USAGE,
        "bl agent setup --agent <name> --base-url <url> --api-key <key> --model <model>",
      );
    }

    const agentDef = AGENTS[agent];
    if (!agentDef) {
      throw new BailianError(
        `Unknown agent "${agent}". Valid agents: ${VALID_AGENT_NAMES.join(", ")}`,
        ExitCode.USAGE,
      );
    }

    // Hermes does not support native Windows
    if (agent === "hermes" && platform() === "win32") {
      process.stderr.write(
        "Warning: Hermes Agent does not support native Windows. Please use WSL2.\n",
      );
    }

    const params: WriteParams = { baseUrl, apiKey, model };

    if (_config.dryRun) {
      process.stdout.write(`[dry-run] Would configure ${agentDef.label} with:\n`);
      process.stdout.write(`  base-url: ${baseUrl}\n`);
      process.stdout.write(
        `  api-key:  ${apiKey.slice(0, 6)}${"*".repeat(Math.max(0, apiKey.length - 6))}\n`,
      );
      process.stdout.write(`  model:    ${model}\n`);
      return;
    }

    const summary = agentDef.write(params);

    const isTTY = process.stderr.isTTY;
    const green = isTTY ? "\x1b[32m" : "";
    const cyan = isTTY ? "\x1b[36m" : "";
    const reset = isTTY ? "\x1b[0m" : "";

    process.stderr.write(`\n${green}✔ ${agentDef.label} configured successfully.${reset}\n\n`);
    for (const p of summary.paths) {
      process.stderr.write(`  Written: ${cyan}${p}${reset}\n`);
    }
    process.stderr.write(`\n  ${summary.nextStep}\n\n`);
  },
});
