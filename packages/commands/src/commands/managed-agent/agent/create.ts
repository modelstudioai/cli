import {
  buildAgentDecl,
  type IStateManager,
  planAgentResourcesWithStateBackend,
  type ResourceAddress,
  syncAgentResourcesWithStateBackend,
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
import { withAgentErrors } from "../_engine/errors.ts";
import {
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
  environment: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Existing environment key from agents.yaml",
      "zh-CN": "agents.yaml 中已有的 Environment key",
    },
  },
  vault: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Existing vault key from agents.yaml",
      "zh-CN": "agents.yaml 中已有的 Vault key",
    },
  },
  skill: {
    type: "array",
    valueHint: "<name>",
    description: {
      "en-US": "Existing custom Skill key from agents.yaml (repeatable)",
      "zh-CN": "agents.yaml 中已有的自定义 Skill key（可重复）",
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

interface AgentKeySelection {
  key: string;
  reusedPending: boolean;
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

function rootAddress(
  selectedAddresses: ResourceAddress[] | undefined,
  agentKey: string,
): ResourceAddress | undefined {
  return selectedAddresses?.find(
    (address) =>
      address.name === agentKey && (address.type === "agent" || address.type === "template"),
  );
}

export default defineCommand({
  description: {
    "en-US": "Declare and create one Managed Agent through an isolated YAML apply",
    "zh-CN": "通过隔离的 YAML Apply 声明并创建一个托管 Agent",
  },
  auth: "apiKey",
  usageArgs:
    "--name <name> --model <model> --instructions <text|path> [--description <text>] [--provider <name>] [--environment <name>] [--vault <name>] [--skill <name>...] [--tool <name>...] [--file <path>] [--yes]",
  flags: CREATE_FLAGS,
  exampleArgs: [
    '--name assistant --model qwen3.8-max --instructions "You are helpful."',
    "--name assistant --model qwen3.8-max --instructions ./prompts/assistant.md --environment dev --skill search --yes",
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US":
        "Without --yes, previews the generated YAML key and scoped plan. --dry-run stays offline. Unrelated resources are not refreshed or drift-checked.",
      "zh-CN":
        "不带 --yes 时预览自动生成的 YAML key 和定向计划；--dry-run 完全离线。无关资源不会刷新或检测 Drift。",
    },
  ],
  validate: (flags) => {
    if (!flags.name.trim()) return "--name must not be empty.";
    if (!flags.model.trim()) return "--model must not be empty.";
    if (!flags.instructions.trim()) return "--instructions must not be empty.";
    return undefined;
  },
  async run(ctx) {
    const { flags, settings } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";
    const project = await loadScopedCreateProject(ctx, file, flags.provider);
    const provider = project.provider;

    const rawAgent = buildAgentDecl(undefined, {
      name: flags.name.trim(),
      description: flags.description,
      model: flags.model,
      instructions: flags.instructions,
      provider,
      environment: flags.environment,
      vault: flags.vault,
      builtinTools: flags.tool,
      skills: flags.skill?.map((skillName) => ({ kind: "custom", name: skillName })),
    }).agent;
    const candidateAgent = (await resolveCandidateDeclaration({
      project,
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
    const candidateConfig = structuredClone(project.config);
    candidateConfig.agents = { ...candidateConfig.agents, [agentKey]: candidateAgent };
    candidateConfig._resolved = true;

    const document = parseDocument(project.source);
    if (document.errors.length > 0) {
      throw new BailianError(
        `YAML parse error: ${document.errors.map((error) => error.message).join("; ")}`,
        ExitCode.USAGE,
      );
    }
    document.setIn(["agents", agentKey], rawAgent);
    const nextSource = document.toString();
    const backendInput = {
      projectName: project.projectName,
      config: candidateConfig,
      configPath: project.configPath,
      providers: { [provider]: candidateConfig.providers[provider] },
      stateBackend: project.stateBackend,
      stateScope: project.stateScope,
    };

    if (settings.dryRun || !flags.yes) {
      const planned = await withAgentErrors(() =>
        withStdoutProtected(() =>
          planAgentResourcesWithStateBackend(backendInput, agentKey, {
            refresh: !settings.dryRun,
            quiet: format === "json",
            mode: "create-only",
          }),
        ),
      );
      const readyToCreate = !planned.diagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      );
      const result = {
        agent: { key: agentKey, name: flags.name.trim(), provider },
        config_file: project.configPath,
        yaml_written: false,
        reused_pending: keySelection.reusedPending,
        requires_confirmation: !settings.dryRun,
        ready_to_create: readyToCreate,
        actions: planned.actions,
        diagnostics: planned.diagnostics,
      };
      if (format === "json") {
        emitResult(result, format);
      } else {
        emitBare(`Generated YAML key: ${agentKey}`);
        for (const diagnostic of planned.diagnostics) {
          emitBare(`[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
        }
        for (const action of planned.actions.filter((entry) => entry.action !== "no-op")) {
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
    const run = await withAgentErrors(() =>
      withStdoutProtected(() =>
        syncAgentResourcesWithStateBackend(backendInput, agentKey, {
          refresh: true,
          quiet: format === "json",
          mode: "create-only",
          policy: "block",
        }),
      ),
    );
    const remoteId = await project.stateBackend.read(project.stateScope, (state) => {
      const selectedRoot = rootAddress(
        run.actions.map((action) => action.address),
        agentKey,
      );
      return selectedRoot ? state.getResource(selectedRoot)?.remote_id : undefined;
    });
    const result = {
      agent: { key: agentKey, name: flags.name.trim(), provider, remote_id: remoteId },
      config_file: project.configPath,
      yaml_written: true,
      reused_pending: keySelection.reusedPending,
      status: run.status,
      actions: run.actions,
      diagnostics: run.diagnostics,
      results: run.results,
      error: run.error,
    };
    if (format === "json") emitResult(result, format);
    else {
      emitBare(`Wrote ${project.configPath} with Agent key '${agentKey}'.`);
      if (run.status === "completed") emitBare(`Created Agent '${flags.name.trim()}'.`);
      else emitBare(`Scoped create ${run.status}: ${run.error ?? "unknown error"}`);
    }
    if (run.status !== "completed") {
      throw new BailianError(
        run.error ?? "Scoped Agent create failed.",
        ExitCode.GENERAL,
        "The YAML declaration was kept. Fix the related dependency or provider error, then re-run the same create command.",
      );
    }
  },
});
