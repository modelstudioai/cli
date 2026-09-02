import { stat } from "node:fs/promises";
import { dirname, extname, relative, sep } from "node:path";
import {
  type BackendRuntimeInput,
  buildAgentDecl,
  type IStateManager,
  inspectSkillSource,
  planProjectWithStateBackend,
  type ResolvedProjectConfig,
  type ResourceAddress,
  type ResourceSyncRun,
  type SkillDecl,
  syncProjectResourcesWithStateBackend,
} from "@openagentpack/sdk";
import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { parseDocument } from "yaml";
import { formatResourceLabel } from "../_engine/address-utils.ts";
import { CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { retainAgentError, withAgentErrors } from "../_engine/errors.ts";
import {
  type LoadedScopedCreateProject,
  loadScopedCreateProject,
  normalizeResourceKey,
  replaceConfigAtomically,
  resolveCandidateDeclaration,
  selectResourceKey,
} from "../_engine/scoped-create.ts";

export { replaceConfigAtomically } from "../_engine/scoped-create.ts";

const CREATE_FLAGS = {
  name: {
    type: "string",
    valueHint: "<name>",
    required: true,
    description: {
      "en-US": "Remote Agent display name; the YAML key is generated automatically",
      "zh-CN": "远端 Agent 显示名称；YAML key 将自动生成",
    },
  },
  model: {
    type: "string",
    valueHint: "<model>",
    required: true,
    description: { "en-US": "Model ID", "zh-CN": "模型 ID" },
  },
  instructions: {
    type: "string",
    valueHint: "<text|path>",
    required: true,
    description: {
      "en-US": "Inline instructions or a ./, ../, or absolute file path",
      "zh-CN": "内联指令，或以 ./、../、/ 开头的文件路径",
    },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Agent description", "zh-CN": "Agent 描述" },
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Target provider; inferred when the config has one effective provider",
      "zh-CN": "目标 Provider；配置只有一个有效 Provider 时自动推断",
    },
  },
  skill: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Existing remote Skill ID (repeatable)",
      "zh-CN": "已存在的远端 Skill ID（可重复）",
    },
  },
  skillDir: {
    type: "array",
    valueHint: "<path>",
    description: {
      "en-US":
        "Local Skill directory or ZIP to declare, upload, and attach through the same scoped create (repeatable)",
      "zh-CN": "通过同一次定向创建声明、上传并绑定的本地 Skill 目录或 ZIP（可重复）",
    },
  },
  type: {
    type: "string",
    valueHint: "<custom|official>",
    choices: ["custom", "official"],
    description: {
      "en-US": "Type applied to every --skill value (default: custom)",
      "zh-CN": "应用于所有 --skill 的类型（默认：custom）",
    },
  },
  tool: {
    type: "array",
    valueHint: "<name>",
    description: {
      "en-US": "Builtin tool name (repeatable)",
      "zh-CN": "内置工具名称（可重复）",
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

type BuiltAgentDecl = ReturnType<typeof buildAgentDecl>["agent"];
type AgentSkillType = "custom" | "official";
type AgentSkillDecl = NonNullable<BuiltAgentDecl["skills"]>[number];

interface AgentKeySelection {
  key: string;
  reusedPending: boolean;
}

interface LocalSkillKeySelection {
  key: string;
  needsCreate: boolean;
  reusedPending: boolean;
  reusedTracked: boolean;
}

interface PreparedLocalSkill extends LocalSkillKeySelection {
  name: string;
  source: string;
  rawDeclaration: Record<string, unknown>;
  resolvedDeclaration: SkillDecl;
}

export function normalizeAgentKey(displayName: string): string {
  return normalizeResourceKey(displayName, "agent");
}

export function selectAgentKey(options: {
  displayName: string;
  provider: string;
  agents: Record<string, BuiltAgentDecl>;
  candidate: BuiltAgentDecl;
  state: IStateManager;
}): AgentKeySelection {
  return selectResourceKey({
    displayName: options.displayName,
    provider: options.provider,
    resourceTypes: ["agent", "template"],
    declarations: options.agents as unknown as Record<string, Record<string, unknown>>,
    candidate: options.candidate as unknown as Record<string, unknown>,
    effectiveName: (key, declaration) =>
      typeof declaration.name === "string" ? declaration.name : key,
    fallbackKey: "agent",
    state: options.state,
  });
}

function agentSkillType(value: string | undefined): AgentSkillType {
  if (value === undefined || value === "custom") return "custom";
  if (value === "official") return "official";
  throw new BailianError("--type must be either custom or official.", ExitCode.USAGE);
}

export function buildAgentSkillRefs(
  skillIds: string[] | undefined,
  type: AgentSkillType = "custom",
): NonNullable<BuiltAgentDecl["skills"]> {
  const seen = new Set<string>();
  const refs: NonNullable<BuiltAgentDecl["skills"]> = [];
  for (const rawId of skillIds ?? []) {
    const skillId = rawId.trim();
    if (!skillId) {
      throw new BailianError("--skill values must not be empty.", ExitCode.USAGE);
    }
    if (seen.has(skillId)) continue;
    seen.add(skillId);
    refs.push({ type, skill_id: skillId });
  }
  return refs;
}

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (!candidate || typeof candidate !== "object") return candidate;
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  };
  return JSON.stringify(normalize(value));
}

export function selectLocalSkillKey(options: {
  displayName: string;
  provider: string;
  declarations: Record<string, Record<string, unknown>>;
  candidate: Record<string, unknown>;
  state: IStateManager;
}): LocalSkillKeySelection {
  const trackedKeys = new Set(
    options.state
      .listResources()
      .filter(
        (resource) =>
          resource.address.provider === options.provider && resource.address.type === "skill",
      )
      .map((resource) => resource.address.name),
  );
  const sameName = Object.entries(options.declarations).filter(([key, declaration]) => {
    const effectiveName = typeof declaration.name === "string" ? declaration.name : key;
    return effectiveName === options.displayName;
  });
  const matchingTracked = sameName.find(
    ([key, declaration]) =>
      trackedKeys.has(key) && canonicalJson(declaration) === canonicalJson(options.candidate),
  );
  if (matchingTracked) {
    return {
      key: matchingTracked[0],
      needsCreate: false,
      reusedPending: false,
      reusedTracked: true,
    };
  }
  const differentTracked = sameName.find(([key]) => trackedKeys.has(key));
  if (differentTracked) {
    throw new BailianError(
      `Skill '${options.displayName}' is already tracked with a different declaration.`,
      ExitCode.USAGE,
      "Modify its existing YAML declaration and run full `bl managed-agent apply`, or bind its remote ID with --skill.",
    );
  }
  const selected = selectResourceKey({
    displayName: options.displayName,
    provider: options.provider,
    resourceTypes: ["skill"],
    declarations: options.declarations,
    candidate: options.candidate,
    effectiveName: (key, declaration) =>
      typeof declaration.name === "string" ? declaration.name : key,
    fallbackKey: "skill",
    state: options.state,
  });
  return {
    ...selected,
    needsCreate: true,
    reusedTracked: false,
  };
}

async function prepareLocalSkillSources(
  project: LoadedScopedCreateProject,
  sources: string[] | undefined,
): Promise<PreparedLocalSkill[]> {
  const declarations = {
    ...((project.config.skills ?? {}) as unknown as Record<string, Record<string, unknown>>),
  };
  const preparedByPath = new Map<string, PreparedLocalSkill>();
  const preparedByKey = new Map<string, PreparedLocalSkill>();
  for (const rawSource of sources ?? []) {
    const requestedSource = rawSource.trim();
    if (!requestedSource) {
      throw new BailianError("--skill-dir values must not be empty.", ExitCode.USAGE);
    }
    const inspected = await withAgentErrors(() =>
      inspectSkillSource(requestedSource, { basePath: process.cwd() }),
    );
    const sourceStat = await stat(inspected.sourcePath);
    const supportedSource =
      sourceStat.isDirectory() ||
      (sourceStat.isFile() && extname(inspected.sourcePath).toLowerCase() === ".zip");
    if (!supportedSource) {
      throw new BailianError(
        `--skill-dir requires a Skill directory or .zip file: ${requestedSource}`,
        ExitCode.USAGE,
      );
    }
    if (preparedByPath.has(inspected.sourcePath)) continue;
    const source =
      relative(dirname(project.configPath), inspected.sourcePath).split(sep).join("/") || ".";
    const rawDeclaration: Record<string, unknown> = {
      name: inspected.name,
      source,
      origin: "custom",
      provider: project.provider,
    };
    const resolvedDeclaration = (await resolveCandidateDeclaration({
      project,
      group: "skills",
      rawDeclaration,
    })) as unknown as SkillDecl;
    const keySelection = await project.stateBackend.read(project.stateScope, (state) =>
      selectLocalSkillKey({
        displayName: inspected.name,
        provider: project.provider,
        declarations,
        candidate: resolvedDeclaration as unknown as Record<string, unknown>,
        state,
      }),
    );
    const existingPrepared = preparedByKey.get(keySelection.key);
    if (existingPrepared) {
      preparedByPath.set(inspected.sourcePath, existingPrepared);
      continue;
    }
    const prepared: PreparedLocalSkill = {
      ...keySelection,
      name: inspected.name,
      source,
      rawDeclaration,
      resolvedDeclaration,
    };
    declarations[keySelection.key] = resolvedDeclaration as unknown as Record<string, unknown>;
    preparedByPath.set(inspected.sourcePath, prepared);
    preparedByKey.set(keySelection.key, prepared);
  }
  return [...preparedByKey.values()];
}

export default defineCommand({
  description: {
    "en-US": "Declare and create one Managed Agent through an isolated YAML apply",
    "zh-CN": "通过隔离的 YAML Apply 声明并创建一个托管 Agent",
  },
  auth: "apiKey",
  usageArgs:
    "--name <name> --model <model> --instructions <text|path> [--description <text>] [--provider <name>] [--skill <id>...] [--type custom|official] [--skill-dir <path>...] [--tool <name>...] [--file <path>] [--yes]",
  flags: CREATE_FLAGS,
  exampleArgs: [
    '--name assistant --model qwen3.8-max --instructions "You are helpful."',
    "--name assistant --model qwen3.8-max --instructions ./prompts/assistant.md --skill skill_abc --yes",
    "--name slides --model qwen3.8-max --instructions ./prompts/slides.md --skill skill_pptx --type official --yes",
    "--name reviewer --model qwen3.8-max --instructions ./prompts/reviewer.md --skill-dir ./skills/code-review --yes",
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US":
        "Without --yes, previews the generated YAML key and scoped plan. --dry-run stays offline. Unrelated resources are not refreshed or drift-checked.",
      "zh-CN":
        "不带 --yes 时预览自动生成的 YAML key 和定向计划；--dry-run 完全离线。无关资源不会刷新或检测 Drift。",
    },
    {
      "en-US":
        "--skill writes an external Skill reference directly into the Agent declaration. --type defaults to custom; use --type official for platform Skills. These Skills are not managed through the top-level skills map.",
      "zh-CN":
        "--skill 会把外部 Skill 引用直接写入 Agent 声明。--type 默认为 custom；平台 Skill 使用 --type official。这些 Skill 不通过顶层 skills 资源管理。",
    },
    {
      "en-US":
        "--skill-dir accepts a local Skill directory or ZIP, writes it as a top-level custom Skill declaration, and writes its generated YAML key into the Agent skills list. Skill and Agent are created together in dependency order. --type applies only to --skill IDs.",
      "zh-CN":
        "--skill-dir 接收本地 Skill 目录或 ZIP，将其写为顶层 custom Skill 声明，并把生成的 YAML key 写入 Agent 的 skills 列表；Skill 与 Agent 按依赖顺序一并创建。--type 只作用于 --skill ID。",
    },
  ],
  validate: (flags) => {
    if (!flags.name.trim()) return "--name must not be empty.";
    if (!flags.model.trim()) return "--model must not be empty.";
    if (!flags.instructions.trim()) return "--instructions must not be empty.";
    if (flags.type && !flags.skill?.length) return "--type requires at least one --skill.";
    if (flags.skill?.some((skillId) => !skillId.trim())) {
      return "--skill values must not be empty.";
    }
    if (flags.skillDir?.some((source) => !source.trim())) {
      return "--skill-dir values must not be empty.";
    }
    return undefined;
  },
  async run(ctx) {
    const { flags, settings } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";
    const project = await loadScopedCreateProject(ctx, file, flags.provider);
    const provider = project.provider;
    const externalSkillRefs = buildAgentSkillRefs(flags.skill, agentSkillType(flags.type));
    const localSkills = await prepareLocalSkillSources(project, flags.skillDir);
    const skillRefs: AgentSkillDecl[] = [
      ...externalSkillRefs,
      ...localSkills.map((skill) => skill.key),
    ];

    const rawAgent = buildAgentDecl(undefined, {
      name: flags.name.trim(),
      description: flags.description,
      model: flags.model,
      instructions: flags.instructions,
      provider,
      builtinTools: flags.tool,
    }).agent;
    rawAgent.skills = skillRefs;
    const candidateConfig = structuredClone(project.config);
    candidateConfig.skills = { ...candidateConfig.skills };
    for (const skill of localSkills) {
      candidateConfig.skills[skill.key] = skill.resolvedDeclaration;
    }
    candidateConfig._resolved = true;
    const candidateAgent = (await resolveCandidateDeclaration({
      project: { ...project, config: candidateConfig },
      group: "agents",
      rawDeclaration: rawAgent as unknown as Record<string, unknown>,
    })) as unknown as BuiltAgentDecl;
    const keySelection = await project.stateBackend.read(project.stateScope, (state) =>
      selectAgentKey({
        displayName: flags.name.trim(),
        provider,
        agents: (project.config.agents ?? {}) as Record<string, BuiltAgentDecl>,
        candidate: candidateAgent,
        state,
      }),
    );
    const agentKey = keySelection.key;
    candidateConfig.agents = { ...candidateConfig.agents, [agentKey]: candidateAgent };
    candidateConfig._resolved = true;

    const document = parseDocument(project.source);
    if (document.errors.length > 0) {
      throw new BailianError(
        `YAML parse error: ${document.errors.map((error) => error.message).join("; ")}`,
        ExitCode.USAGE,
      );
    }
    for (const skill of localSkills) {
      document.setIn(["skills", skill.key], skill.rawDeclaration);
    }
    document.setIn(["agents", agentKey], rawAgent);
    const nextSource = document.toString();
    const agentRoot: ResourceAddress = { type: "agent", name: agentKey, provider };
    const roots: ResourceAddress[] = [
      ...localSkills
        .filter((skill) => skill.needsCreate)
        .map((skill) => ({ type: "skill" as const, name: skill.key, provider })),
      agentRoot,
    ];
    const backendInput: BackendRuntimeInput = {
      projectName: project.projectName,
      config: candidateConfig as ResolvedProjectConfig,
      configPath: project.configPath,
      providers: { [provider]: candidateConfig.providers[provider] },
      stateBackend: project.stateBackend,
      stateScope: project.stateScope,
    };

    if (settings.dryRun || !flags.yes) {
      const planned = await withAgentErrors(() =>
        withStdoutProtected(() =>
          planProjectWithStateBackend(backendInput, {
            provider,
            scope: { roots },
            refresh: !settings.dryRun,
            quiet: format === "json",
            mode: "create-only",
          }),
        ),
      );
      const readyToCreate = !planned.plan.diagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      );
      const result = {
        agent: { key: agentKey, name: flags.name.trim(), provider, skills: skillRefs },
        local_skills: localSkills.map((skill) => ({
          key: skill.key,
          name: skill.name,
          source: skill.source,
          reused_pending: skill.reusedPending,
          reused_tracked: skill.reusedTracked,
        })),
        config_file: project.configPath,
        yaml_written: false,
        reused_pending: keySelection.reusedPending,
        requires_confirmation: !settings.dryRun,
        ready_to_create: readyToCreate,
        actions: planned.plan.actions,
        diagnostics: planned.plan.diagnostics,
      };
      if (format === "json") {
        emitResult(result, format);
      } else {
        for (const skill of localSkills) {
          emitBare(`Generated Skill YAML key: ${skill.key}`);
        }
        emitBare(`Generated Agent YAML key: ${agentKey}`);
        for (const diagnostic of planned.plan.diagnostics) {
          emitBare(`[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
        }
        for (const action of planned.plan.actions.filter((entry) => entry.action !== "no-op")) {
          const icon = action.action === "create" ? "+" : action.action === "update" ? "~" : "-";
          emitBare(`  ${icon} ${formatResourceLabel(action.address)}`);
        }
        emitBare(
          settings.dryRun
            ? "Dry run: YAML, State, and remote resources were not changed."
            : "Preview only: re-run with --yes to write YAML and create this Agent.",
        );
      }
      return;
    }

    await replaceConfigAtomically(project.configPath, project.source, nextSource);
    let run: ResourceSyncRun;
    try {
      run = await withAgentErrors(() =>
        withStdoutProtected(() =>
          syncProjectResourcesWithStateBackend(backendInput, {
            provider,
            scope: { roots },
            refresh: true,
            quiet: format === "json",
            mode: "create-only",
            policy: "block",
          }),
        ),
      );
    } catch (error) {
      throw retainAgentError(
        error,
        "The YAML declarations were kept. Fix the related dependency or provider error, then re-run the same create command.",
        "Scoped Agent and Skill create failed.",
      );
    }
    const remoteResources = await project.stateBackend.read(project.stateScope, (state) => ({
      agentId: state.getResource(agentRoot)?.remote_id,
      skillIds: Object.fromEntries(
        localSkills.map((skill) => [
          skill.key,
          state.getResource({ type: "skill", name: skill.key, provider })?.remote_id,
        ]),
      ),
    }));
    const results = run.execution?.results ?? [];
    const failed = results.find((entry) => entry.status === "failed");
    const status = failed ? "failed" : "completed";
    const result = {
      agent: {
        key: agentKey,
        name: flags.name.trim(),
        provider,
        remote_id: remoteResources.agentId,
        skills: skillRefs,
      },
      local_skills: localSkills.map((skill) => ({
        key: skill.key,
        name: skill.name,
        source: skill.source,
        remote_id: remoteResources.skillIds[skill.key],
        reused_pending: skill.reusedPending,
        reused_tracked: skill.reusedTracked,
      })),
      config_file: project.configPath,
      yaml_written: true,
      reused_pending: keySelection.reusedPending,
      status,
      actions: run.planned.plan.actions,
      diagnostics: run.planned.plan.diagnostics,
      results,
      error: failed?.error,
    };
    if (format === "json") emitResult(result, format);
    else {
      emitBare(
        `Wrote ${project.configPath} with Agent key '${agentKey}'${localSkills.length ? ` and ${localSkills.length} local Skill declaration(s)` : ""}.`,
      );
      if (status === "completed") emitBare(`Created Agent '${flags.name.trim()}'.`);
      else emitBare(`Scoped create ${status}: ${failed?.error ?? "unknown error"}`);
    }
    if (failed) {
      throw new BailianError(
        failed.error ?? "Scoped Agent create failed.",
        ExitCode.GENERAL,
        "The YAML declarations were kept. Fix the related dependency or provider error, then re-run the same create command.",
      );
    }
  },
});
