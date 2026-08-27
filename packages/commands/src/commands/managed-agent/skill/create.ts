import { dirname, relative, sep } from "node:path";
import { inspectSkillSource } from "@openagentpack/sdk";
import { BailianError, defineCommand, ExitCode, type FlagsDef } from "bailian-cli-core";
import { CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import {
  loadScopedCreateProject,
  resolveCandidateDeclaration,
  runScopedTopLevelCreate,
  SCOPED_CREATE_NOTE,
} from "../_engine/scoped-create.ts";

const FLAGS = {
  source: {
    type: "string",
    valueHint: "<directory|zip|SKILL.md>",
    required: true,
    description: {
      "en-US": "Local Skill directory, ZIP archive, or single SKILL.md",
      "zh-CN": "本地 Skill 目录、ZIP 压缩包或单个 SKILL.md",
    },
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Target provider; inferred when unambiguous",
      "zh-CN": "目标 Provider；可唯一确定时自动推断",
    },
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
  yes: {
    type: "switch",
    description: {
      "en-US": "Write YAML and upload the Skill through the scoped create",
      "zh-CN": "写入 YAML 并通过定向创建上传 Skill",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Declare and create one custom Managed Agent Skill from a local source",
    "zh-CN": "从本地来源声明并创建一个自定义托管 Agent Skill",
  },
  auth: "apiKey",
  usageArgs: "--source <directory|zip|SKILL.md> [--provider <name>] [--file <path>] [--yes]",
  flags: FLAGS,
  exampleArgs: ["--source ./skills/code-review", "--source ./skill.zip --yes"],
  notes: [
    ...CREDENTIALS_NOTE,
    ...SCOPED_CREATE_NOTE,
    {
      "en-US":
        "The YAML key is derived from SKILL.md frontmatter name. Remote URLs remain available through handwritten YAML plus full apply.",
      "zh-CN":
        "YAML key 从 SKILL.md frontmatter 的 name 生成。远程 URL 仍可手工写入 YAML 后执行全量 Apply。",
    },
  ],
  validate: (flags) => (!flags.source.trim() ? "--source must not be empty." : undefined),
  async run(ctx) {
    const project = await loadScopedCreateProject(
      ctx,
      ctx.flags.file ?? "agents.yaml",
      ctx.flags.provider,
    );
    const inspected = await inspectSkillSource(ctx.flags.source, { basePath: process.cwd() });
    const source =
      relative(dirname(project.configPath), inspected.sourcePath).split(sep).join("/") || ".";
    const existingSkills = (project.config.skills ?? {}) as unknown as Record<
      string,
      Record<string, unknown>
    >;
    const trackedSameName = await project.stateBackend.read(project.stateScope, (state) =>
      state.listResources().some((resource) => {
        if (resource.address.provider !== project.provider || resource.address.type !== "skill") {
          return false;
        }
        const declaration = existingSkills[resource.address.name];
        const canonicalName =
          typeof declaration?.name === "string" ? declaration.name : resource.address.name;
        return canonicalName === inspected.name;
      }),
    );
    if (trackedSameName) {
      throw new BailianError(
        `Skill '${inspected.name}' is already tracked.`,
        ExitCode.USAGE,
        "Modify its existing YAML declaration and run full `bl managed-agent apply` to create a new version.",
      );
    }
    const rawDeclaration: Record<string, unknown> = {
      name: inspected.name,
      source,
      origin: "custom",
      provider: project.provider,
    };
    const resolvedDeclaration = await resolveCandidateDeclaration({
      project,
      group: "skills",
      rawDeclaration,
    });
    await runScopedTopLevelCreate({
      host: ctx,
      project,
      group: "skills",
      resourceType: "skill",
      displayName: inspected.name,
      rawDeclaration,
      resolvedDeclaration,
      existingDeclarations: existingSkills,
      effectiveName: (key, declaration) =>
        typeof declaration.name === "string" ? declaration.name : key,
      fallbackKey: "skill",
      yes: ctx.flags.yes,
    });
  },
});
