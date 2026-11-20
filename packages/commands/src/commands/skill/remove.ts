import { defineSkillCommand } from "./update-check.ts";
import { runSkillLifecycle, useTargetRecords, withSkillMutation } from "./lifecycle.ts";
import { runRegistryLifecycle } from "./registry-lifecycle.ts";
import { sourceFlag, targetFlags, validateSelection } from "./targets.ts";

export default defineSkillCommand({
  updateCheck: "offline",
  description: {
    "en-US": "Remove locally installed skills (registry is untouched)",
    "zh-CN": "移除本地已安装的 Skill（不修改 Registry）",
  },
  auth: "none",
  defaultOutput: "json",
  usageArgs:
    "--name <all|code,...> [--source oss|cloud] [--agent <agent|all>] [--scope user|project]",
  flags: {
    source: sourceFlag,
    ...targetFlags,
    name: {
      type: "string",
      valueHint: "<all|name,...>",
      description: {
        "en-US": "Skills to remove: all or comma-separated skill names",
        "zh-CN": "要移除的 Skill：all 或以逗号分隔的 Skill 名称",
      },
      required: true,
    },
  },
  validate: (flags) => validateSelection(flags, true),
  exampleArgs: [
    "--source oss --name spark-video",
    "--name all",
    "--name pdf --agent cursor --scope project --dry-run",
  ],

  async run(ctx) {
    const report = await withSkillMutation(ctx, async () =>
      useTargetRecords(ctx.flags)
        ? runSkillLifecycle("remove", ctx, ctx.flags)
        : runRegistryLifecycle("remove", ctx, ctx.flags),
    );
    ctx.output.result(report.data, "text" in report ? { text: report.text } : undefined);
    if (report.firstError) throw report.firstError;
  },
});
