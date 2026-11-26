import { defineSkillCommand } from "./update-check.ts";
import { runSkillLifecycle, useTargetRecords, withSkillMutation } from "./lifecycle.ts";
import { runRegistryLifecycle } from "./registry-lifecycle.ts";
import { selectorFlags, sourceFlag, targetFlags, validateSelection } from "./targets.ts";

export default defineSkillCommand({
  updateCheck: "offline",
  description: {
    "en-US": "Remove locally installed skills (registry is untouched)",
    "zh-CN": "移除本地已安装的 Skill（不修改 Registry）",
  },
  auth: "none",
  defaultOutput: "json",
  usageArgs:
    "(--name <all|name,...> | --code <code,...>) [--agent <agent|all>] [--scope user|project]",
  flags: {
    source: sourceFlag,
    ...targetFlags,
    ...selectorFlags,
  },
  validate: (flags) => validateSelection(flags, "remove"),
  exampleArgs: [
    "--name spark-video",
    "--name all",
    "--code skill_example --agent cursor --scope project --dry-run",
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
