import { randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  buildAgentDecl,
  type IStateManager,
  LocalFileStateBackend,
  planAgentResourcesWithStateBackend,
  type ResolvedProjectConfig,
  type ResourceAddress,
  resolveProjectConfigFromObject,
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
import { formatResourceLabel } from "./_engine/address-utils.ts";
import { CREDENTIALS_NOTE, resolveAgentProjectConfig } from "./_engine/config-loader.ts";
import { assertProviderCredentials } from "./_engine/credentials.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { createFileStateScope } from "./_engine/file-state-manager.ts";
import { installSdkTransport } from "./_engine/transport.ts";

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

export function normalizeAgentKey(displayName: string): string {
  const normalized = displayName
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "agent";
}

export function selectAgentKey(options: {
  displayName: string;
  provider: string;
  agents: Record<string, BuiltAgentDecl>;
  candidate: BuiltAgentDecl;
  state: IStateManager;
}): AgentKeySelection {
  const tracked = new Set(
    options.state
      .listResources()
      .filter(
        (resource) =>
          resource.address.provider === options.provider &&
          (resource.address.type === "agent" || resource.address.type === "template"),
      )
      .map((resource) => resource.address.name),
  );
  const candidateJson = canonicalJson(options.candidate);
  for (const [key, declaration] of Object.entries(options.agents)) {
    const effectiveName = declaration.name ?? key;
    if (effectiveName !== options.displayName || tracked.has(key)) continue;
    if (canonicalJson({ ...declaration, name: effectiveName }) === candidateJson) {
      return { key, reusedPending: true };
    }
  }

  const baseKey = normalizeAgentKey(options.displayName);
  if (!(baseKey in options.agents)) return { key: baseKey, reusedPending: false };
  let suffix = 2;
  while (`${baseKey}-${suffix}` in options.agents) suffix += 1;
  return { key: `${baseKey}-${suffix}`, reusedPending: false };
}

export async function replaceConfigAtomically(
  configPath: string,
  expectedSource: string,
  nextSource: string,
): Promise<void> {
  const destination = resolve(configPath);
  const currentSource = await readFile(destination, "utf8");
  if (currentSource !== expectedSource) {
    throw new BailianError(
      `${configPath} changed while Agent create was being prepared.`,
      ExitCode.GENERAL,
      "Review the latest YAML and re-run the command; no file was overwritten.",
    );
  }
  const currentStat = await stat(destination);
  const temporary = resolve(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`);
  await writeFile(temporary, nextSource, { flag: "wx", mode: currentStat.mode });
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function resolveTargetProvider(
  config: ResolvedProjectConfig,
  requested: string | undefined,
): string {
  if (requested === "all") {
    throw new BailianError("--provider all is not valid for Agent create.", ExitCode.USAGE);
  }
  if (requested) {
    if (requested in config.providers) return requested;
    throw new BailianError(
      `Provider '${requested}' is not configured in agents.yaml.`,
      ExitCode.USAGE,
    );
  }
  const defaultProvider = config.defaults?.provider;
  if (defaultProvider && defaultProvider !== "all") return defaultProvider;
  const configuredProviders = Object.keys(config.providers);
  if (configuredProviders.length === 1) return configuredProviders[0]!;
  throw new BailianError(
    "Agent create cannot infer one target provider.",
    ExitCode.USAGE,
    "Pass --provider <name> when defaults.provider is 'all' or multiple providers are configured.",
  );
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
    const sourceBeforeLoad = await readFile(resolve(file), "utf8").catch((error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new BailianError(
          `Config file not found: ${file}`,
          ExitCode.USAGE,
          "Run `bl managed-agent init` first.",
        );
      }
      throw error;
    });
    const loaded = await withAgentErrors(() =>
      resolveAgentProjectConfig(ctx, file, { credentials: "none" }),
    );
    const source = await readFile(loaded.configPath, "utf8");
    if (source !== sourceBeforeLoad) {
      throw new BailianError(
        `${file} changed while it was being loaded.`,
        ExitCode.GENERAL,
        "Re-run the command against the latest file.",
      );
    }

    const provider = resolveTargetProvider(loaded.config, flags.provider);
    if (!settings.dryRun) assertProviderCredentials(loaded.config.providers, [provider]);
    installSdkTransport(ctx);

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
    const temporaryKey = "__bailian_cli_agent_create_candidate__";
    const resolvedCandidate = await withAgentErrors(() =>
      resolveProjectConfigFromObject(
        {
          ...loaded.config,
          agents: { ...loaded.config.agents, [temporaryKey]: rawAgent },
        },
        { projectName: loaded.projectName, basePath: dirname(loaded.configPath) },
      ),
    );
    const candidateAgent = resolvedCandidate.config.agents![temporaryKey]! as BuiltAgentDecl;
    const stateBackend = new LocalFileStateBackend({ configPath: loaded.configPath });
    const stateScope = createFileStateScope(loaded.configPath, loaded.projectName);
    const keySelection = await stateBackend.read(stateScope, (state) =>
      selectAgentKey({
        displayName: flags.name.trim(),
        provider,
        agents: (loaded.config.agents ?? {}) as Record<string, BuiltAgentDecl>,
        candidate: candidateAgent,
        state,
      }),
    );
    const agentKey = keySelection.key;
    const candidateConfig = structuredClone(loaded.config);
    candidateConfig.agents = { ...candidateConfig.agents, [agentKey]: candidateAgent };
    candidateConfig._resolved = true;

    const document = parseDocument(source);
    if (document.errors.length > 0) {
      throw new BailianError(
        `YAML parse error: ${document.errors.map((error) => error.message).join("; ")}`,
        ExitCode.USAGE,
      );
    }
    document.setIn(["agents", agentKey], rawAgent);
    const nextSource = document.toString();
    const backendInput = {
      projectName: loaded.projectName,
      config: candidateConfig,
      configPath: loaded.configPath,
      providers: { [provider]: candidateConfig.providers[provider] },
      stateBackend,
      stateScope,
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
        config_file: loaded.configPath,
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

    await replaceConfigAtomically(loaded.configPath, source, nextSource);
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
    const remoteId = await stateBackend.read(stateScope, (state) => {
      const selectedRoot = rootAddress(
        run.actions.map((action) => action.address),
        agentKey,
      );
      return selectedRoot ? state.getResource(selectedRoot)?.remote_id : undefined;
    });
    const result = {
      agent: { key: agentKey, name: flags.name.trim(), provider, remote_id: remoteId },
      config_file: loaded.configPath,
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
      emitBare(`Wrote ${loaded.configPath} with Agent key '${agentKey}'.`);
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
