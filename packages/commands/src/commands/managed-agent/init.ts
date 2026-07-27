import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";

const GITIGNORE_ADDITIONS = `
# agents
agents.state.json
.env
`;

const PROVIDERS = ["bailian", "claude", "qoder", "ark", "all"] as const;

const PROVIDER_BLOCKS: Record<string, string> = {
  bailian: `  bailian:\n    # bl auth login --api-key <key> sets DASHSCOPE_API_KEY; --base-url <url> sets BAILIAN_BASE_URL\n    api_key: \${DASHSCOPE_API_KEY}\n    base_url: \${BAILIAN_BASE_URL}`,
  claude: `  claude:\n    api_key: \${ANTHROPIC_API_KEY}`,
  qoder: `  qoder:\n    api_key: \${QODER_PAT}\n    gateway: "https://api.qoder.com/api/v1/cloud"`,
  ark: `  ark:\n    api_key: \${ARK_API_KEY}`,
};

const SINGLE_MODEL: Record<string, string> = {
  bailian: `    model: qwen3.7-max`,
  claude: `    model: claude-sonnet-4-6`,
  qoder: `    model: ultimate`,
  ark: `    model: doubao-seed-2-1-pro-260628`,
};

function buildTemplate(options: { provider: string; agentName: string }): string {
  const providerBlock =
    options.provider === "all"
      ? `${PROVIDER_BLOCKS.bailian}\n${PROVIDER_BLOCKS.claude}\n${PROVIDER_BLOCKS.qoder}\n${PROVIDER_BLOCKS.ark}`
      : PROVIDER_BLOCKS[options.provider]!;

  const modelBlock =
    options.provider === "all"
      ? `    model:\n      bailian: qwen3.7-max\n      claude: claude-sonnet-4-6\n      qoder: ultimate\n      ark: doubao-seed-2-1-pro-260628`
      : SINGLE_MODEL[options.provider]!;

  const toolBlock =
    options.provider === "bailian"
      ? "[bash, read, glob, grep]"
      : "[read, glob, grep, web_search, web_fetch]";

  return `version: "1"

providers:
${providerBlock}

defaults:
  provider: ${options.provider === "all" ? "all" : options.provider}

environments:
  dev:
    config:
      type: cloud
      networking:
        type: unrestricted

agents:
  ${options.agentName}:
    description: "General-purpose assistant"
${modelBlock}
    instructions: |
      You are a helpful assistant.
    environment: dev
    tools:
      builtin: ${toolBlock}
`;
}

const INIT_FLAGS = {
  provider: {
    type: "string",
    valueHint: "<name>",
    description: "Provider: bailian, claude, qoder, ark, all (default: bailian)",
    choices: PROVIDERS,
  },
  agentName: {
    type: "string",
    valueHint: "<name>",
    description: "Name of the first agent (default: assistant)",
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Output config path (default: agents.yaml)",
  },
  force: {
    type: "switch",
    description: "Overwrite an existing config file",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Create a new agents.yaml template",
  auth: "none",
  usageArgs: "[--provider <name>] [--agent-name <name>] [--file <path>] [--force]",
  flags: INIT_FLAGS,
  exampleArgs: ["", "--provider bailian --agent-name assistant", "--provider all"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const provider = flags.provider ?? "bailian";
    const agentName = flags.agentName ?? "assistant";
    const file = flags.file ?? "agents.yaml";

    if (existsSync(file) && !flags.force) {
      throw new BailianError(
        `${file} already exists.`,
        ExitCode.USAGE,
        "Pass --force to overwrite.",
      );
    }

    const gitignorePath = ".gitignore";

    if (settings.dryRun) {
      let wouldUpdateGitignore = true;
      if (existsSync(gitignorePath)) {
        const content = await readFile(gitignorePath, "utf8");
        wouldUpdateGitignore = !content.includes("agents.state.json");
      }
      emitResult(
        {
          would_create: file,
          provider,
          agent: agentName,
          would_update_gitignore: wouldUpdateGitignore,
        },
        format,
      );
      return;
    }

    const template = buildTemplate({ provider, agentName });
    await writeFile(file, template, "utf8");

    if (existsSync(gitignorePath)) {
      const content = await readFile(gitignorePath, "utf8");
      if (!content.includes("agents.state.json")) {
        await writeFile(gitignorePath, content + GITIGNORE_ADDITIONS, "utf8");
      }
    } else {
      await writeFile(gitignorePath, `${GITIGNORE_ADDITIONS.trim()}\n`, "utf8");
    }

    if (format === "json") {
      emitResult({ created: file, provider, agent: agentName }, format);
    } else {
      emitBare(`Created ${file}`);
      if (provider === "bailian" || provider === "all") {
        emitBare(
          "Credentials: run `bl auth login --api-key <key> --base-url <url>`, or set DASHSCOPE_API_KEY / BAILIAN_BASE_URL.",
        );
      }
      emitBare("Next: edit agents.yaml, then run `bl managed-agent plan`.");
    }
  },
});
