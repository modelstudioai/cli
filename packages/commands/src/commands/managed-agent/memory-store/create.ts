import { BailianError, defineCommand, ExitCode, type FlagsDef } from "bailian-cli-core";
import { CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import {
  loadScopedCreateProject,
  parseJsonInputs,
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
      "en-US": "Memory Store display name; generates a YAML key",
      "zh-CN": "Memory Store 显示名称；自动生成 YAML key",
    },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Store description (default: empty)",
      "zh-CN": "记忆库描述（默认：空）",
    },
  },
  metadata: {
    type: "array",
    valueHint: "<key=value>",
    description: { "en-US": "Metadata entry (repeatable)", "zh-CN": "Metadata 条目（可重复）" },
  },
  entry: {
    type: "array",
    valueHint: "<json|@path>",
    description: {
      "en-US": "Initial entry JSON with key and content (repeatable)",
      "zh-CN": "含 key、content 的初始化条目 JSON（可重复）",
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
    "en-US": "Declare and create a Memory Store through scoped YAML apply",
    "zh-CN": "通过定向 YAML Apply 声明并创建记忆库",
  },
  auth: "apiKey",
  flags: FLAGS,
  usageArgs:
    "--name <name> [--description <text>] [--metadata <key=value>...] [--entry <json|@path>...] [--file <path>] [--yes]",
  exampleArgs: [
    "--name Notes",
    {
      "en-US": '--name Notes --entry \'{"key":"notes.md","content":"Initial notes"}\' --dry-run',
      "zh-CN": '--name Notes --entry \'{"key":"notes.md","content":"初始笔记"}\' --dry-run',
    },
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    ...SCOPED_CREATE_NOTE,
    {
      "en-US":
        "Store lifecycle is managed by agents.yaml. Entries initialize new stores; existing content is preserved unless entries_mode: sync is explicitly configured.",
      "zh-CN":
        "记忆库生命周期由 agents.yaml 管理。entries 仅初始化新库；只有显式配置 entries_mode: sync 才持续同步已有正文。",
    },
  ],
  validate: (flags) =>
    !flags.name.trim() ? "--name must not be empty. / --name 不能为空。" : undefined,
  async run(ctx) {
    const entries = (await parseJsonInputs(ctx.flags.entry, "entry")).map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new BailianError(
          "Each --entry must be a JSON object. / 每个 --entry 必须为 JSON 对象。",
          ExitCode.USAGE,
        );
      }
      const entry = value as Record<string, unknown>;
      if (typeof entry.key !== "string" || !entry.key.trim() || typeof entry.content !== "string") {
        throw new BailianError(
          "Each --entry requires a non-empty key and string content. / 每个 --entry 必须包含非空 key 和字符串 content。",
          ExitCode.USAGE,
        );
      }
      return { key: entry.key, content: entry.content };
    });
    const project = await loadScopedCreateProject(ctx, ctx.flags.file ?? "agents.yaml");
    const rawDeclaration: Record<string, unknown> = {
      name: ctx.flags.name.trim(),
      description: ctx.flags.description ?? "",
      provider: project.provider,
      metadata: parseMetadata(ctx.flags.metadata),
      ...(entries.length ? { entries } : {}),
    };
    const resolvedDeclaration = await resolveCandidateDeclaration({
      project,
      group: "memory_stores",
      rawDeclaration,
    });
    await runScopedTopLevelCreate({
      host: ctx,
      project,
      group: "memory_stores",
      resourceType: "memory_store",
      displayName: ctx.flags.name.trim(),
      rawDeclaration,
      resolvedDeclaration,
      existingDeclarations: (project.config.memory_stores ?? {}) as unknown as Record<
        string,
        Record<string, unknown>
      >,
      effectiveName: (key, declaration) =>
        typeof declaration.name === "string" ? declaration.name : key,
      fallbackKey: "memory-store",
      yes: ctx.flags.yes,
    });
  },
});
