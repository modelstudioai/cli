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
      "en-US": "Remote Environment display name; the YAML key is generated automatically",
      "zh-CN": "远端 Environment 显示名称；YAML key 将自动生成",
    },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Environment description", "zh-CN": "Environment 描述" },
  },
  metadata: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US": "Metadata entry (repeatable)",
      "zh-CN": "Metadata 条目（可重复）",
    },
  },
  apt: packageFlag("APT"),
  pip: packageFlag("pip"),
  npm: packageFlag("npm"),
  cargo: packageFlag("Cargo"),
  gem: packageFlag("Ruby gem"),
  go: packageFlag("Go"),
  provider: providerFlag(),
  file: fileFlag(),
  yes: yesFlag(),
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Declare and create one Managed Agent Environment through a scoped YAML apply",
    "zh-CN": "通过定向 YAML Apply 声明并创建一个托管 Agent Environment",
  },
  auth: "apiKey",
  usageArgs:
    "--name <name> [--description <text>] [--metadata <key=value>...] [--apt <package>...] [--pip <package>...] [--npm <package>...] [--cargo <package>...] [--gem <package>...] [--go <package>...] [--provider <name>] [--file <path>] [--yes]",
  flags: FLAGS,
  exampleArgs: [
    "--name Development",
    "--name Development --pip pandas --npm typescript --metadata owner=platform --yes",
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    ...SCOPED_CREATE_NOTE,
    {
      "en-US":
        "Creates a cloud Environment with unrestricted networking. Without --yes, only previews the generated YAML key and scoped plan.",
      "zh-CN":
        "创建使用 unrestricted 网络的 cloud Environment。不带 --yes 时仅预览自动生成的 YAML key 和定向计划。",
    },
  ],
  validate: (flags) => (!flags.name.trim() ? "--name must not be empty." : undefined),
  async run(ctx) {
    const project = await loadScopedCreateProject(
      ctx,
      ctx.flags.file ?? "agents.yaml",
      ctx.flags.provider,
    );
    const packages = Object.fromEntries(
      ["apt", "pip", "npm", "cargo", "gem", "go"]
        .map((manager) => [manager, ctx.flags[manager as keyof typeof ctx.flags]])
        .filter((entry) => Array.isArray(entry[1]) && entry[1].length > 0),
    );
    const rawDeclaration: Record<string, unknown> = {
      name: ctx.flags.name.trim(),
      description: ctx.flags.description,
      provider: project.provider,
      config: {
        type: "cloud",
        networking: { type: "unrestricted" },
        ...(Object.keys(packages).length > 0 ? { packages } : {}),
      },
      metadata: parseMetadata(ctx.flags.metadata),
    };
    const resolvedDeclaration = await resolveCandidateDeclaration({
      project,
      group: "environments",
      rawDeclaration,
    });
    await runScopedTopLevelCreate({
      host: ctx,
      project,
      group: "environments",
      resourceType: "environment",
      displayName: ctx.flags.name.trim(),
      rawDeclaration,
      resolvedDeclaration,
      existingDeclarations: (project.config.environments ?? {}) as unknown as Record<
        string,
        Record<string, unknown>
      >,
      effectiveName: (key, declaration) =>
        typeof declaration.name === "string" ? declaration.name : key,
      fallbackKey: "environment",
      yes: ctx.flags.yes,
    });
  },
});

function packageFlag(manager: string) {
  return {
    type: "array" as const,
    valueHint: "<package>",
    description: {
      "en-US": `${manager} package (repeatable)`,
      "zh-CN": `${manager} 软件包（可重复）`,
    },
  };
}

function providerFlag() {
  return {
    type: "string" as const,
    valueHint: "<name>",
    description: {
      "en-US": "Target provider; inferred when unambiguous",
      "zh-CN": "目标 Provider；可唯一确定时自动推断",
    },
  };
}

function fileFlag() {
  return {
    type: "string" as const,
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  };
}

function yesFlag() {
  return {
    type: "switch" as const,
    description: {
      "en-US": "Write YAML and run the scoped remote create",
      "zh-CN": "写入 YAML 并执行定向远端创建",
    },
  };
}
