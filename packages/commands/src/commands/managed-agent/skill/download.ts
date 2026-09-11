import { downloadRemoteSkill } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
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
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult(
        {
          would_download_skill: ctx.flags.skillId,
          version: ctx.flags.skillVersion,
          output_file: ctx.flags.outputFile,
        },
        format,
      );
      return;
    }
    const content = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return downloadRemoteSkill(runtime, ctx.flags.skillId, ctx.flags.skillVersion, {
          provider: "bailian",
        });
      }),
    );
    const outputFile = await writeOutputFile(ctx.flags.outputFile, content, ctx.flags.force);
    if (format === "json")
      emitResult(
        { downloaded: ctx.flags.skillId, version: ctx.flags.skillVersion, output_file: outputFile },
        format,
      );
    else emitBare(`Skill downloaded to ${outputFile}`);
  },
});
