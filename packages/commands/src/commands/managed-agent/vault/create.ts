import { defineCommand, type FlagsDef } from "bailian-cli-core";
import { CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import {
  loadScopedCreateProject,
  parseMetadata,
  resolveCandidateDeclaration,
  runScopedTopLevelCreate,
  SCOPED_CREATE_NOTE,
} from "../_engine/scoped-create.ts";

const FLAGS = {
  name: {
    type: "string",
    valueHint: "<name>",
    required: true,
    description: {
      "en-US": "Remote Vault display name; the YAML key is generated automatically",
      "zh-CN": "远端 Vault 显示名称；YAML key 将自动生成",
    },
  },
  metadata: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US": "Metadata entry (repeatable)",
      "zh-CN": "Metadata 条目（可重复）",
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
      "en-US": "Write YAML and run the scoped remote create",
      "zh-CN": "写入 YAML 并执行定向远端创建",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Declare and create one empty Managed Agent Vault through a scoped YAML apply",
    "zh-CN": "通过定向 YAML Apply 声明并创建一个空的托管 Agent Vault",
  },
  auth: "apiKey",
  usageArgs: "--name <name> [--metadata <key=value>...] [--file <path>] [--yes]",
  flags: FLAGS,
  exampleArgs: ["--name Production", "--name Production --metadata owner=platform --yes"],
  notes: [
    ...CREDENTIALS_NOTE,
    ...SCOPED_CREATE_NOTE,
    {
      "en-US": "Creates an empty Vault. Add secrets later with `vault credential create`.",
      "zh-CN": "创建空 Vault；随后使用 `vault credential create` 添加 Secret。",
    },
  ],
  validate: (flags) => (!flags.name.trim() ? "--name must not be empty." : undefined),
  async run(ctx) {
    const project = await loadScopedCreateProject(ctx, ctx.flags.file ?? "agents.yaml");
    const rawDeclaration: Record<string, unknown> = {
      display_name: ctx.flags.name.trim(),
      provider: project.provider,
      credentials: [],
      metadata: parseMetadata(ctx.flags.metadata),
    };
    const resolvedDeclaration = await resolveCandidateDeclaration({
      project,
      group: "vaults",
      rawDeclaration,
    });
    await runScopedTopLevelCreate({
      host: ctx,
      project,
      group: "vaults",
      resourceType: "vault",
      displayName: ctx.flags.name.trim(),
      rawDeclaration,
      resolvedDeclaration,
      existingDeclarations: (project.config.vaults ?? {}) as unknown as Record<
        string,
        Record<string, unknown>
      >,
      effectiveName: (key, declaration) =>
        typeof declaration.display_name === "string" ? declaration.display_name : key,
      fallbackKey: "vault",
      yes: ctx.flags.yes,
    });
  },
});
