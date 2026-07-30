import { platform } from "os";
import { defineCommand, detectOutputFormat, maskToken, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { AGENTS, VALID_AGENT_NAMES, type WriteParams } from "./writers.ts";
import { decodeTokenPlanKey } from "./decode-key.ts";
import { resolveRegionBaseUrl } from "./writers/utils.ts";

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
  },
  region: {
    type: "string",
    valueHint: "<region>",
    description:
      "Model Studio region (e.g. cn-beijing, ap-southeast-1); converted into --base-url. Token Plan only",
  },
  apiKey: {
    type: "string",
    valueHint: "<key>",
    description: "API key",
  },
  key: {
    type: "string",
    valueHint: "<encoded>",
    description:
      'Obfuscated API key from the web console (starts with "o1_"); decoded into --api-key',
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
    description: "OpenClaw only: model context window in tokens (default: 256000)",
  },
  wireApi: {
    type: "string",
    valueHint: "<api>",
    description:
      'Codex only: wire protocol (default: responses). "chat" only works with legacy Codex <= 0.80.0',
    choices: ["chat", "responses"],
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Configure a coding agent to use DashScope API",
  auth: "none",
  usageArgs:
    "--agent <name> (--base-url <url> | --region <region>) (--api-key <key> | --key <encoded>) --model <model>",
  flags: FLAGS,
  exampleArgs: [
    "--agent claude-code --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3-max",
    "--agent qwen-code --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3-coder-plus",
    "--agent codex --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3-coder-plus",
  ],
  validate(flags) {
    if (!flags.baseUrl && !flags.region) return "one of --base-url or --region is required";
    if (flags.baseUrl && flags.region) return "--base-url and --region are mutually exclusive";
    if (!flags.apiKey && !flags.key) return "one of --api-key or --key is required";
    if (flags.apiKey && flags.key) return "--api-key and --key are mutually exclusive";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const agentName = flags.agent;
    const { model, contextWindow, wireApi } = flags;
    // --region is a Token Plan convenience: convert it into a base URL and use
    // it exactly as --base-url would be.
    const baseUrl = flags.region ? resolveRegionBaseUrl(flags.region) : flags.baseUrl!;
    // --key carries the web console's obfuscated form; decode it up front so
    // even --dry-run validates the token.
    const apiKey = flags.key ? decodeTokenPlanKey(flags.key) : flags.apiKey!;
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
        },
        format,
      );
      return;
    }

    const params: WriteParams = {
      baseUrl,
      apiKey,
      model,
      contextWindow,
      wireApi,
    };
    const summary = agentDef.write(params);

    if (!settings.quiet) {
      emitBare(`${agentDef.label} configured successfully.`);
      for (const path of summary.paths) emitBare(`  Written: ${path}`);
      emitBare(`  ${summary.nextStep}`);
      for (const warning of summary.warnings ?? []) {
        process.stderr.write(`Warning: ${warning}\n`);
      }
    }
  },
});
