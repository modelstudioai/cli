import { platform } from "os";
import {
  defineCommand,
  detectOutputFormat,
  maskToken,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { AGENTS, VALID_AGENT_NAMES, type WriteParams } from "./writers.ts";

const FLAGS = {
  agent: {
    type: "string",
    valueHint: "<name>",
    description: `Target agent: ${VALID_AGENT_NAMES.join(", ")}`,
    required: true,
    choices: VALID_AGENT_NAMES,
  },
  baseUrl: {
    type: "string",
    valueHint: "<url>",
    description: "API base URL",
    required: true,
  },
  apiKey: {
    type: "string",
    valueHint: "<key>",
    description: "API key",
    required: true,
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description: "Default model name",
    required: true,
  },
  contextWindow: {
    type: "number",
    valueHint: "<tokens>",
    description:
      "Context window in tokens (openclaw only; omit to use the agent default)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Configure a coding agent to use DashScope API",
  auth: "none",
  usageArgs: "--agent <name> --base-url <url> --api-key <key> --model <model>",
  flags: FLAGS,
  exampleArgs: [
    "--agent claude-code --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3-max",
    "--agent qwen-code --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3-coder-plus",
    "--agent codex --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3-coder-plus",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const agentName = flags.agent;
    const { baseUrl, apiKey, model } = flags;
    const agentDef = AGENTS[agentName];
    const format = detectOutputFormat(settings.output);

    // Hermes has no native Windows support.
    if (agentName === "hermes" && platform() === "win32") {
      process.stderr.write(
        "Warning: Hermes Agent does not support native Windows. Please use WSL2.\n",
      );
    }

    if (settings.dryRun) {
      emitResult(
        {
          agent: agentName,
          label: agentDef.label,
          base_url: baseUrl,
          api_key: maskToken(apiKey),
          model,
          ...(flags.contextWindow !== undefined
            ? { context_window: flags.contextWindow }
            : {}),
        },
        format,
      );
      return;
    }

    const params: WriteParams = {
      baseUrl,
      apiKey,
      model,
      contextWindow: flags.contextWindow,
    };
    const summary = agentDef.write(params);

    if (!settings.quiet) {
      emitBare(`${agentDef.label} configured successfully.`);
      for (const path of summary.paths) emitBare(`  Written: ${path}`);
      emitBare(`  ${summary.nextStep}`);
    }
  },
});
