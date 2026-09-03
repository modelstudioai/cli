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

function buildTemplate(options: { agentName: string }): string {
  return `version: "1"

providers:
  bailian:
    # bl auth login --api-key <key> sets DASHSCOPE_API_KEY; --base-url <url> sets BAILIAN_BASE_URL
    api_key: \${DASHSCOPE_API_KEY}
    base_url: \${BAILIAN_BASE_URL}

defaults:
  provider: bailian

environments:
  dev:
    config:
      type: cloud
      networking:
        type: unrestricted

agents:
  ${options.agentName}:
    description: "General-purpose assistant"
    model: qwen3.8-max
    instructions: |
      You are a helpful assistant.
    environment: dev
    tools:
      builtin: [bash, read, glob, grep]
`;
}

const INIT_FLAGS = {
  agentName: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Name of the first agent (default: assistant)",
      "zh-CN": "第一个 Agent 的名称（默认：assistant）",
    },
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Output config path (default: agents.yaml)",
      "zh-CN": "输出配置路径（默认：agents.yaml）",
    },
  },
  force: {
    type: "switch",
    description: { "en-US": "Overwrite an existing config file", "zh-CN": "覆盖已有配置文件" },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Create a new agents.yaml template",
    "zh-CN": "创建新的 agents.yaml 模板",
  },
  auth: "none",
  usageArgs: "[--agent-name <name>] [--file <path>] [--force]",
  flags: INIT_FLAGS,
  exampleArgs: ["", "--agent-name assistant"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
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
          provider: "bailian",
          agent: agentName,
          would_update_gitignore: wouldUpdateGitignore,
        },
        format,
      );
      return;
    }

    const template = buildTemplate({ agentName });
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
      emitResult({ created: file, provider: "bailian", agent: agentName }, format);
    } else {
      emitBare(`Created ${file}`);
      emitBare(
        "Credentials: run `bl auth login --api-key <key> --base-url <url>`, or set DASHSCOPE_API_KEY / BAILIAN_BASE_URL.",
      );
      emitBare("Next: edit agents.yaml, then run `bl managed-agent plan`.");
    }
  },
});
