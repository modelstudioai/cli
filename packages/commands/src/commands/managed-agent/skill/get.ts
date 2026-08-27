import { getRemoteSkill } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { displayValue } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { SKILL_GET_FLAGS } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "Get a Managed Agent skill", "zh-CN": "获取托管 Agent Skill 详情" },
  auth: "apiKey",
  usageArgs: "--skill-id <id>",
  flags: SKILL_GET_FLAGS,
  exampleArgs: ["--skill-id skill_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const skill = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteSkill(runtime, ctx.flags.skillId, { provider: ctx.flags.provider });
      }),
    );
    if (format === "json") {
      emitResult(skill, format);
      return;
    }
    emitBare(`ID:          ${skill.id}`);
    emitBare(`Name:        ${skill.name}`);
    emitBare(`Description: ${displayValue(skill.description, 120)}`);
    emitBare(`Source:      ${skill.source}`);
    emitBare(`Status:      ${skill.status}`);
    emitBare(`Version:     ${displayValue(skill.latest_version)}`);
  },
});
