import { getRemoteAgent } from "@openagentpack/sdk";
import { defineCommand } from "bailian-cli-core";
import { displayValue } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { AGENT_GET_FLAGS } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "Get a Managed Agent", "zh-CN": "获取托管 Agent 详情" },
  auth: "apiKey",
  usageArgs: "--agent-id <id> [--agent-version <n>] [--file <path>]",
  flags: AGENT_GET_FLAGS,
  exampleArgs: ["--agent-id agent_abc", "--agent-id agent_abc --agent-version 3 --output json"],
  notes: CREDENTIALS_NOTE,
  validate: (flags) =>
    flags.agentVersion !== undefined &&
    (!Number.isInteger(flags.agentVersion) || flags.agentVersion < 1)
      ? "--agent-version must be a positive integer."
      : undefined,
  async run(ctx) {
    const agent = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteAgent(runtime, ctx.flags.agentId, {
          provider: "bailian",
          version: ctx.flags.agentVersion,
        });
      }),
    );
    ctx.output.result(agent, {
      text:
        ctx.settings.output === "text"
          ? (() => {
              const lines: string[] = [];
              lines.push(`ID:          ${agent.id}`);
              lines.push(`Name:        ${displayValue(agent.name)}`);
              lines.push(`Description: ${displayValue(agent.description, 120)}`);
              lines.push(`Version:     ${displayValue(agent.version)}`);
              lines.push(`Type:        ${displayValue(agent.type)}`);
              lines.push(`Created:     ${displayValue(agent.created_at)}`);
              lines.push(`Updated:     ${displayValue(agent.updated_at)}`);
              return lines.join("\n");
            })()
          : undefined,
    });
  },
});
