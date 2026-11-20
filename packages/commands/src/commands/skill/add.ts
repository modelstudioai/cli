import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineSkillCommand } from "./update-check.ts";
import { BailianError, type CommandContext } from "bailian-cli-core";
import { runSkillLifecycle, useTargetRecords, withSkillMutation } from "./lifecycle.ts";
import { runRegistryLifecycle } from "./registry-lifecycle.ts";
import { SkillAddPackages } from "./mcp-dependencies.ts";
import { needsCloud, sourceFlag, targetFlags, validateSelection } from "./targets.ts";

const flags = {
  ...WORKSPACE_FLAG,
  source: sourceFlag,
  ...targetFlags,
  skillVersion: {
    type: "string",
    valueHint: "<version>",
    description: { "en-US": "Install and pin this exact version", "zh-CN": "安装并固定指定版本" },
  },
  withMcp: {
    type: "boolean",
    implicitValue: true,
    valueHint: "<bool>",
    description: {
      "en-US":
        "Read serverCode entries from mcp-config.json beside SKILL.md and activate inactive dependencies (default true).",
      "zh-CN":
        "读取 SKILL.md 同目录下 mcp-config.json 声明的 serverCode 并开通未启用的依赖（默认 true）。",
    },
  },
  all: {
    type: "switch",
    description: {
      "en-US": "Install all skills from the registry",
      "zh-CN": "安装 Registry 中的全部 Skill",
    },
  },
  name: {
    type: "string",
    valueHint: "<name,...>",
    description: {
      "en-US": "Comma-separated skill names to install",
      "zh-CN": "要安装的 Skill 名称，以逗号分隔",
    },
  },
} as const;

type AddContext = Pick<
  CommandContext<typeof flags>,
  "client" | "settings" | "output" | "localize" | "identity" | "flags"
>;
type AddReport = Awaited<ReturnType<typeof install>>;
async function install(ctx: AddContext, staged?: SkillAddPackages) {
  return useTargetRecords(ctx.flags)
    ? runSkillLifecycle("add", ctx, ctx.flags, staged)
    : runRegistryLifecycle("add", ctx, ctx.flags, staged);
}
function successfulSkills(report: AddReport) {
  return new Set(
    report.data.results.filter((row) => row.status !== "failed").map((row) => row.code),
  );
}
async function dependencyReport(
  ctx: AddContext,
  report: AddReport,
  staged: SkillAddPackages | undefined,
  preview: boolean,
) {
  return staged
    ? staged.report(ctx, successfulSkills(report), preview)
    : { fields: { mcp_dep_results: [], mcp_dependency_status: "disabled" }, firstError: undefined };
}
function outputReport(
  ctx: AddContext,
  report: AddReport,
  deps: Awaited<ReturnType<typeof dependencyReport>>,
) {
  const text =
    "text" in report && !deps.fields.mcp_dep_results.length ? { text: report.text } : undefined;
  ctx.output.result(
    {
      ...report.data,
      dry_run: ctx.settings.dryRun,
      ...deps.fields,
    },
    text,
  );
  if (report.firstError || deps.firstError) throw report.firstError ?? deps.firstError;
}

export default defineSkillCommand<typeof flags, SkillAddPackages | undefined>({
  description: {
    "en-US": "Install skills from the Bailian skill registry into local agents",
    "zh-CN": "将百炼 Skill Registry 中的 Skill 安装到本地 Agent",
  },
  auth: "apiKey",
  requiresApiKey: (values) => needsCloud(values) || (values.withMcp !== false && "optional"),
  defaultOutput: "json",
  usageArgs:
    "(--all | --name <code,...>) [--source oss|cloud] [--agent <agent|all>] [--scope user|project] [--skill-version <version>] [--with-mcp <bool>]",
  flags,
  notes: [
    {
      "en-US":
        "Use --dry-run to inspect the selected package versions and preview MCP activation. Installation activates inactive dependencies and may incur charges. Public OSS packages install without a key. Checking their declared MCP services requires a Bailian API key. Use --with-mcp false to install only.",
      "zh-CN":
        "用 --dry-run 查看所选版本声明的依赖及开通计划。安装时会开通未启用的依赖，可能产生费用。公开 OSS 包可免鉴权安装，检查其 MCP 服务需要百炼 API Key。只安装 Skill 可用 --with-mcp false。",
    },
  ],
  validate(flags) {
    return validateSelection(flags, true);
  },
  exampleArgs: [
    "--all",
    "--source oss --name spark-video,bailian-model-recommend",
    "--name pdf --agent cursor --scope project --skill-version 1.0 --dry-run",
  ],

  async prepare(ctx) {
    const staged = ctx.flags.withMcp === false ? undefined : new SkillAddPackages(ctx.localize);
    try {
      if (!staged && !ctx.settings.dryRun)
        return { data: undefined, preview: {}, risk: null, notices: [] };
      const report = await install({ ...ctx, settings: { ...ctx.settings, dryRun: true } }, staged);
      const skills = successfulSkills(report);
      await staged?.plan(ctx, skills);
      const deps = await dependencyReport(ctx, report, staged, true);
      if (!ctx.settings.dryRun && !skills.size && report.firstError)
        outputReport(ctx, report, deps);
      return {
        data: staged,
        preview: { ...report.data, ...deps.fields },
        renderDryRun: () => outputReport(ctx, report, deps),
        risk: null,
        notices: [],
        dispose: () => staged?.dispose(),
      };
    } catch (error) {
      staged?.dispose();
      throw error;
    }
  },
  async run(ctx) {
    if (ctx.flags.withMcp !== false && !ctx.prepared)
      throw new BailianError(
        ctx.localize({
          "en-US": "Missing Skill dependency plan.",
          "zh-CN": "缺少 Skill 依赖计划。",
        }),
      );
    const report = await withSkillMutation(ctx, () => install(ctx, ctx.prepared));
    outputReport(ctx, report, await dependencyReport(ctx, report, ctx.prepared, false));
  },
});
