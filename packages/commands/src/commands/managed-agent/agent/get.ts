import { getRemoteAgent } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
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
    const format = detectOutputFormat(ctx.settings.output);
    const agent = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteAgent(runtime, ctx.flags.agentId, {
          provider: ctx.flags.provider,
          version: ctx.flags.agentVersion,
        });
      }),
    );
    if (format === "json") {
      emitResult(agent, format);
      return;
    }
    emitBare(`ID:          ${agent.id}`);
    emitBare(`Name:        ${displayValue(agent.name)}`);
    emitBare(`Description: ${displayValue(agent.description, 120)}`);
    emitBare(`Version:     ${displayValue(agent.version)}`);
    emitBare(`Type:        ${displayValue(agent.type)}`);
    emitBare(`Created:     ${displayValue(agent.created_at)}`);
    emitBare(`Updated:     ${displayValue(agent.updated_at)}`);
  },
});
