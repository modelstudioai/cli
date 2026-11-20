import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineSkillCommand } from "./update-check.ts";
import { runSkillLifecycle, useTargetRecords, withSkillMutation } from "./lifecycle.ts";
import { runRegistryLifecycle } from "./registry-lifecycle.ts";
import { needsCloud, sourceFlag, targetFlags, validateSelection } from "./targets.ts";

export default defineSkillCommand({
  description: {
    "en-US": "Update installed skills to the latest registry versions",
    "zh-CN": "将已安装的 Skill 更新到 Registry 最新版本",
  },
  auth: "apiKey",
  requiresApiKey: needsCloud,
  defaultOutput: "json",
  usageArgs:
    "[--all | --name <code,...>] [--source oss|cloud] [--agent <agent|all>] [--scope user|project] [--diff]",
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
        "en-US": "Update all installed skills (default when neither --all nor --name is given)",
        "zh-CN": "更新全部已安装 Skill（未指定 --all 或 --name 时的默认行为）",
      },
    },
    name: {
      type: "string",
      valueHint: "<name,...>",
      description: {
        "en-US": "Comma-separated skill names to update (must be already installed)",
        "zh-CN": "要更新的 Skill 名称，以逗号分隔（必须已安装）",
      },
    },
  },
  notes: [
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
    "--source oss --name spark-video",
    "--name pdf --agent cursor --scope project --diff --dry-run",
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
