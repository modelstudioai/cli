import { platform } from "os";
import {
  defineCommand,
  detectOutputFormat,
  maskToken,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { AGENTS, VALID_AGENT_NAMES, type WriteParams } from "./writers.ts";
import { decodeTokenPlanKey } from "./decode-key.ts";
import { resolveRegionBaseUrl, findLatestBackup, restoreLatestBackup } from "./writers/utils.ts";

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
  restore: {
    type: "switch",
    description:
      "Restore the agent's config files from the latest .bak backup created by this command",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Configure a coding agent to use DashScope API",
  auth: "none",
  usageArgs:
    "--agent <name> ((--base-url <url> | --region <region>) (--api-key <key> | --key <encoded>) --model <model> | --restore)",
  flags: FLAGS,
  exampleArgs: [
    "--agent claude-code --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3-max",
    "--agent qwen-code --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3-coder-plus",
    "--agent codex --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3-coder-plus",
    "--agent claude-code --restore",
  ],
  validate(flags) {
    if (flags.restore) {
      const writeFlags = [flags.baseUrl, flags.region, flags.apiKey, flags.key, flags.model];
      if (writeFlags.some((value) => value !== undefined)) {
        return "--restore cannot be combined with --base-url/--region/--api-key/--key/--model";
      }
      return undefined;
    }
    if (!flags.model) return "--model is required";
    if (!flags.baseUrl && !flags.region) return "one of --base-url or --region is required";
    if (flags.baseUrl && flags.region) return "--base-url and --region are mutually exclusive";
    if (!flags.apiKey && !flags.key) return "one of --api-key or --key is required";
    if (flags.apiKey && flags.key) return "--api-key and --key are mutually exclusive";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const agentName = flags.agent;
    const { contextWindow, wireApi } = flags;
    const agentDef = AGENTS[agentName];
    const format = detectOutputFormat(settings.output);

    // --restore: roll each managed config file back to its newest .bak sibling.
    if (flags.restore) {
      const paths = agentDef.configPaths();

      if (settings.dryRun) {
        emitResult(
          {
            agent: agentName,
            label: agentDef.label,
            restore: paths.map((path) => ({
              path,
              backup: findLatestBackup(path) ?? null,
            })),
          },
          format,
        );
        return;
      }

      const results = paths.map((path) => restoreLatestBackup(path));
      if (results.every((result) => !result.backupPath)) {
        throw new BailianError(
          `No backups found for ${agentDef.label}.`,
          ExitCode.GENERAL,
          "Backups are created as <config>.bak.<timestamp> next to each config file when this command writes it.",
        );
      }

      if (!settings.quiet) {
        emitBare(`${agentDef.label} config restored from backup.`);
        for (const result of results) {
          if (result.backupPath) emitBare(`  Restored: ${result.path} <- ${result.backupPath}`);
          else emitBare(`  Skipped (no backup): ${result.path}`);
        }
      }
      return;
    }

    // Write mode — validate() guarantees these flags are present.
    const model = flags.model!;
    // --region is a Token Plan convenience: convert it into a base URL and use
    // it exactly as --base-url would be.
    const baseUrl = flags.region ? resolveRegionBaseUrl(flags.region) : flags.baseUrl!;
    // --key carries the web console's obfuscated form; decode it up front so
    // even --dry-run validates the token.
    const apiKey = flags.key ? decodeTokenPlanKey(flags.key) : flags.apiKey!;

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
