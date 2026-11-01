import { downloadRemoteSkill } from "@openagentpack/sdk";
import { defineCommand } from "bailian-cli-core";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { writeOutputFile } from "../_engine/output-file.ts";
import { SKILL_DOWNLOAD_FLAGS } from "./_shared.ts";

export default defineCommand({
  description: {
    "en-US": "Download a Managed Agent skill version",
    "zh-CN": "下载托管 Agent Skill 版本",
  },
  auth: "apiKey",
  usageArgs: "--skill-id <id> --skill-version <version> --output-file <path> [--force]",
  flags: SKILL_DOWNLOAD_FLAGS,
  exampleArgs: ["--skill-id skill_abc --skill-version 3 --output-file ./skill.zip"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    if (ctx.settings.dryRun) {
      ctx.output.result({
        would_download_skill: ctx.flags.skillId,
        version: ctx.flags.skillVersion,
        output_file: ctx.flags.outputFile,
      });
      return;
    }
    const content = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return downloadRemoteSkill(runtime, ctx.flags.skillId, ctx.flags.skillVersion, {
          provider: "bailian",
        });
      }),
    );
    const outputFile = await writeOutputFile(ctx.flags.outputFile, content, ctx.flags.force);
    ctx.output.result(
      { downloaded: ctx.flags.skillId, version: ctx.flags.skillVersion, output_file: outputFile },
      { text: ctx.settings.output === "text" ? `Skill downloaded to ${outputFile}` : undefined },
    );
  },
});
