import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineSkillCommand } from "./update-check.ts";
import { runSkillLifecycle, useTargetRecords, withSkillMutation } from "./lifecycle.ts";
import { runRegistryLifecycle } from "./registry-lifecycle.ts";
import {
  needsCloud,
  selectorFlags,
  sourceFlag,
  targetFlags,
  validateSelection,
} from "./targets.ts";

export default defineSkillCommand({
  description: {
    "en-US": "Update installed skills to the latest registry versions",
    "zh-CN": "将已安装的 Skill 更新到 Registry 最新版本",
  },
  auth: "apiKey",
  requiresApiKey: needsCloud,
  defaultOutput: "json",
  usageArgs:
    "[--name <name,...> | --code <code,...> | --all] [--agent <agent|all>] [--scope user|project] [--diff]",
  flags: {
    ...WORKSPACE_FLAG,
    source: sourceFlag,
    ...targetFlags,
    diff: {
      type: "switch",
      description: {
        "en-US": "Show changed files, or the required download in a preview",
        "zh-CN": "显示文件差异，预览时标明所需下载",
      },
    },
    all: {
      type: "switch",
      description: {
        "en-US": "Update all installed public OSS skills in the selected scope",
        "zh-CN": "更新所选范围内全部已安装的公开 OSS Skill",
      },
    },
    ...selectorFlags,
  },
  notes: [
    {
      "en-US":
        "--name all is an alias for --all. With no selector, update installed cloud skills in the selected scope.",
      "zh-CN": "--name all 是 --all 的兼容写法。省略选择参数时，更新所选范围内已安装的云端 Skill。",
    },
    {
      "en-US":
        "Other Skill commands check for updates to unpinned installations from the selected source. Available updates appear on stderr. Removal uses the cached check offline.",
      "zh-CN":
        "其他 Skill 命令会检查所选来源中未固定版本的安装项，有更新时在 stderr 提示。卸载时仅读取有效缓存。",
    },
  ],
  validate(flags) {
    return validateSelection(flags);
  },
  exampleArgs: [
    "",
    "--all",
    "--name spark-video",
    "--code skill_example --agent cursor --scope project --diff --dry-run",
  ],

  async run(ctx) {
    const report = await withSkillMutation(ctx, async () =>
      useTargetRecords(ctx.flags)
        ? runSkillLifecycle("update", ctx, ctx.flags)
        : runRegistryLifecycle("update", ctx, ctx.flags),
    );
    ctx.output.result(report.data, "text" in report ? { text: report.text } : undefined);
    if (report.firstError) throw report.firstError;
  },
});
