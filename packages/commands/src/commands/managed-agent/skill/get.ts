import { getRemoteSkill } from "@openagentpack/sdk";
import { defineCommand } from "bailian-cli-core";
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
    const skill = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteSkill(runtime, ctx.flags.skillId, { provider: "bailian" });
      }),
    );
    ctx.output.result(skill, {
      text:
        ctx.settings.output === "text"
          ? (() => {
              const lines: string[] = [];
              lines.push(`ID:          ${skill.id}`);
              lines.push(`Name:        ${skill.name}`);
              lines.push(`Description: ${displayValue(skill.description, 120)}`);
              lines.push(`Source:      ${skill.source}`);
              lines.push(`Status:      ${skill.status}`);
              lines.push(`Version:     ${displayValue(skill.latest_version)}`);
              return lines.join("\n");
            })()
          : undefined,
    });
  },
});
