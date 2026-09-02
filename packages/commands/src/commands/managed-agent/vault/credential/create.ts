import { dirname } from "node:path";
import {
  bootstrapRuntimeCredentialsSync,
  createVaultCredentialWithStateBackend,
  planVaultCredentialCreateWithStateBackend,
  type ResolvedProjectConfig,
  resolveProjectConfigFromObject,
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
import { CREDENTIALS_NOTE } from "../../_engine/config-loader.ts";
import { withStdoutProtected } from "../../_engine/console-capture.ts";
import { retainAgentError, withAgentErrors } from "../../_engine/errors.ts";
import {
  loadScopedCreateProject,
  parseMetadata,
  replaceConfigAtomically,
  SCOPED_CREATE_NOTE,
} from "../../_engine/scoped-create.ts";

const FLAGS = {
  vault: {
    type: "string",
    valueHint: "<yaml-key>",
    required: true,
    description: {
      "en-US": "Existing tracked Vault key from agents.yaml",
      "zh-CN": "agents.yaml 中已跟踪的 Vault key",
    },
  },
  name: {
    type: "string",
    valueHint: "<name>",
    required: true,
    description: {
      "en-US": "Credential display name",
      "zh-CN": "Credential 显示名称",
    },
  },
  secretName: {
    type: "string",
    valueHint: "<name>",
    required: true,
    description: {
      "en-US": "Environment variable name exposed to the Agent",
      "zh-CN": "提供给 Agent 的环境变量名",
    },
  },
  secretEnv: {
    type: "string",
    valueHint: "<env-name>",
    required: true,
    description: {
      "en-US": "Local environment variable containing the secret value",
      "zh-CN": "保存真实 Secret 的本地环境变量名",
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
      "en-US": "Write YAML and create the remote Credential",
      "zh-CN": "写入 YAML 并创建远端 Credential",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Append and create one environment-variable Credential in a tracked Vault",
    "zh-CN": "在已跟踪 Vault 中追加并创建一个环境变量 Credential",
  },
  auth: "apiKey",
  usageArgs:
    "--vault <yaml-key> --name <name> --secret-name <name> --secret-env <env-name> [--metadata <key=value>...] [--file <path>] [--yes]",
  flags: FLAGS,
  exampleArgs: [
    "--vault production --name api-token --secret-name API_TOKEN --secret-env PROD_API_TOKEN",
    "--vault production --name api-token --secret-name API_TOKEN --secret-env PROD_API_TOKEN --yes",
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    ...SCOPED_CREATE_NOTE,
    {
      "en-US":
        "--secret-env is an environment variable name, not the secret itself. The CLI auto-loads the nearest .env from the current directory upward; shell exports and CI secret injection also work.",
      "zh-CN":
        "--secret-env 接收环境变量名，不接收 Secret 本身。CLI 会从当前目录向上自动加载最近的 .env，也支持 Shell export 和 CI Secret 注入。",
    },
    {
      "en-US":
        "YAML stores only ${ENV_NAME}. Never commit .env; subsequent full apply runs must provide the same environment variable.",
      "zh-CN":
        "YAML 只保存 ${ENV_NAME}。不要提交 .env；后续执行全量 Apply 时仍需提供同名环境变量。",
    },
  ],
  validate: (flags) => {
    if (!flags.vault.trim()) return "--vault must not be empty.";
    if (!flags.name.trim()) return "--name must not be empty.";
    if (!flags.secretName.trim()) return "--secret-name must not be empty.";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(flags.secretEnv)) {
      return "--secret-env must be a valid environment variable name.";
    }
    return undefined;
  },
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    bootstrapRuntimeCredentialsSync();
    const secretValue = process.env[ctx.flags.secretEnv];
    const project = await loadScopedCreateProject(ctx, ctx.flags.file ?? "agents.yaml").finally(
      () => {
        delete process.env[ctx.flags.secretEnv];
      },
    );
    const vault = project.config.vaults?.[ctx.flags.vault];
    if (!vault) {
      throw new BailianError(
        `Vault '${ctx.flags.vault}' is not declared in agents.yaml.`,
        ExitCode.USAGE,
      );
    }
    if (ctx.flags.yes && !ctx.settings.dryRun && !secretValue) {
      throw new BailianError(
        `Environment variable '${ctx.flags.secretEnv}' is not set or is empty.`,
        ExitCode.USAGE,
        `Set it in your shell, CI secret store, or a local .env file, then re-run with --secret-env ${ctx.flags.secretEnv}.`,
      );
    }
    const metadata = parseMetadata(ctx.flags.metadata);
    const rawCredential = {
      name: ctx.flags.name.trim(),
      type: "environment_variable" as const,
      secret_name: ctx.flags.secretName.trim(),
      secret_value: `\${${ctx.flags.secretEnv}}`,
      networking: { type: "unrestricted" as const },
      ...(metadata ? { metadata } : {}),
    };
    const runtimeCredential = {
      ...rawCredential,
      secret_value: secretValue ?? "__dry_run_secret__",
    };
    const document = parseDocument(project.source);
    if (document.errors.length > 0) {
      throw new BailianError(
        `YAML parse error: ${document.errors.map((error) => error.message).join("; ")}`,
        ExitCode.USAGE,
      );
    }
    const rawConfig = document.toJS() as {
      vaults?: Record<string, { credentials?: unknown[] }>;
    };
    const rawCredentials = rawConfig.vaults?.[ctx.flags.vault]?.credentials ?? [];
    const sameNameCredentials = rawCredentials.filter(
      (credential): credential is Record<string, unknown> =>
        Boolean(
          credential &&
          typeof credential === "object" &&
          !Array.isArray(credential) &&
          (credential as Record<string, unknown>).name === rawCredential.name,
        ),
    );
    let reusedPending = false;
    if (sameNameCredentials.length > 0) {
      const lastCredential = rawCredentials.at(-1);
      const existing = sameNameCredentials[0]!;
      if (
        sameNameCredentials.length !== 1 ||
        existing !== lastCredential ||
        !sameCredentialDeclaration(existing, rawCredential)
      ) {
        throw new BailianError(
          `Vault '${ctx.flags.vault}' already declares a different credential named '${rawCredential.name}'.`,
          ExitCode.USAGE,
          "Modify the existing YAML declaration and run full `bl managed-agent apply`; create never overwrites it.",
        );
      }
      reusedPending = true;
    }
    const rawCandidate = structuredClone(project.config) as unknown as Record<string, unknown>;
    const rawVaults = rawCandidate.vaults as Record<string, Record<string, unknown>>;
    const rawVault = rawVaults[ctx.flags.vault]!;
    if (!reusedPending) {
      rawVaults[ctx.flags.vault] = {
        ...rawVault,
        credentials: [
          ...((rawVault.credentials as unknown[] | undefined) ?? []),
          runtimeCredential,
        ],
      };
    }
    const resolvedCandidate = await withAgentErrors(() =>
      resolveProjectConfigFromObject(rawCandidate, {
        projectName: project.projectName,
        basePath: dirname(project.configPath),
      }),
    );
    const candidateConfig = resolvedCandidate.config;
    if (!reusedPending) {
      document.addIn(["vaults", ctx.flags.vault, "credentials"], rawCredential);
    }
    const nextSource = reusedPending ? project.source : document.toString();
    const backendInput = {
      projectName: project.projectName,
      config: candidateConfig as ResolvedProjectConfig,
      configPath: project.configPath,
      providers: { [project.provider]: candidateConfig.providers[project.provider] },
      stateBackend: project.stateBackend,
      stateScope: project.stateScope,
    };

    if (ctx.settings.dryRun || !ctx.flags.yes) {
      const planned = await withAgentErrors(() =>
        withStdoutProtected(() =>
          planVaultCredentialCreateWithStateBackend(
            backendInput,
            ctx.flags.vault,
            ctx.flags.name.trim(),
            {
              provider: project.provider,
              refresh: !ctx.settings.dryRun,
              quiet: format === "json",
              checkRemote: !ctx.settings.dryRun,
            },
          ),
        ),
      );
      const result = {
        vault: { key: ctx.flags.vault, remote_id: planned.vaultRemoteId },
        credential: {
          name: ctx.flags.name.trim(),
          secret_name: ctx.flags.secretName.trim(),
          secret_env: ctx.flags.secretEnv,
        },
        config_file: project.configPath,
        yaml_written: false,
        reused_pending: reusedPending,
        requires_confirmation: !ctx.settings.dryRun,
        ready_to_create: true,
        remote_checked: planned.remoteChecked,
        reuse_remote: planned.reuseRemote,
      };
      if (format === "json") emitResult(result, format);
      else {
        emitBare(`Vault: ${ctx.flags.vault}`);
        emitBare(`Credential: ${ctx.flags.name.trim()} (secret from ${ctx.flags.secretEnv})`);
        emitBare(
          ctx.settings.dryRun
            ? "Dry run: YAML, State, and remote resources were not changed."
            : "Preview only: re-run with --yes to append YAML and create this Credential.",
        );
      }
      return;
    }

    await replaceConfigAtomically(project.configPath, project.source, nextSource);
    let created;
    try {
      created = await withAgentErrors(() =>
        withStdoutProtected(() =>
          createVaultCredentialWithStateBackend(
            backendInput,
            ctx.flags.vault,
            ctx.flags.name.trim(),
            { provider: project.provider, refresh: true, quiet: format === "json" },
          ),
        ),
      );
    } catch (error) {
      throw retainAgentError(
        error,
        "The YAML declaration was kept. Restore the same secret environment variable and re-run this command; an already-created matching Credential will be adopted.",
        "Vault Credential create failed.",
      );
    }
    const result = {
      vault: { key: ctx.flags.vault, remote_id: created.vaultRemoteId },
      credential: {
        id: created.credentialId,
        name: ctx.flags.name.trim(),
        secret_name: ctx.flags.secretName.trim(),
        secret_env: ctx.flags.secretEnv,
      },
      config_file: project.configPath,
      yaml_written: true,
      reused_pending: reusedPending,
      adopted: created.adopted,
      status: "completed",
    };
    if (format === "json") emitResult(result, format);
    else {
      emitBare(`Wrote ${project.configPath} and created Credential '${ctx.flags.name.trim()}'.`);
    }
  },
});

function sameCredentialDeclaration(
  existing: Record<string, unknown>,
  candidate: Record<string, unknown>,
): boolean {
  return canonicalJson(existing) === canonicalJson(candidate);
}

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (!candidate || typeof candidate !== "object") return candidate;
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  };
  return JSON.stringify(normalize(value));
}
