import type { DeploymentDecl } from "@openagentpack/sdk";
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
      "en-US": "Remote Deployment display name; the YAML key is generated automatically",
      "zh-CN": "远端 Deployment 显示名称；YAML key 将自动生成",
    },
  },
  agent: {
    type: "string",
    valueHint: "<yaml-key>",
    required: true,
    description: {
      "en-US": "Existing Agent key from agents.yaml",
      "zh-CN": "agents.yaml 中已有的 Agent key",
    },
  },
  agentVersion: {
    type: "number",
    valueHint: "<number>",
    description: { "en-US": "Agent version", "zh-CN": "Agent 版本" },
  },
  environment: {
    type: "string",
    valueHint: "<yaml-key>",
    description: {
      "en-US": "Existing Environment key from agents.yaml",
      "zh-CN": "agents.yaml 中已有的 Environment key",
    },
  },
  vault: {
    type: "array",
    valueHint: "<yaml-key>",
    description: {
      "en-US": "Existing Vault key from agents.yaml (repeatable)",
      "zh-CN": "agents.yaml 中已有的 Vault key（可重复）",
    },
  },
  message: {
    type: "array",
    valueHint: "<text>",
    description: {
      "en-US": "Initial user message (repeatable)",
      "zh-CN": "初始用户消息（可重复）",
    },
  },
  event: {
    type: "array",
    valueHint: "<json|@path>",
    description: {
      "en-US": "Initial user.message or system.message JSON (repeatable)",
      "zh-CN": "初始 user.message 或 system.message JSON（可重复）",
    },
  },
  resource: {
    type: "array",
    valueHint: "<json|@path>",
    description: {
      "en-US": "File Resource JSON with source or file_id (repeatable)",
      "zh-CN": "包含 source 或 file_id 的 File Resource JSON（可重复）",
    },
  },
  schedule: {
    type: "string",
    valueHint: "<cron>",
    description: { "en-US": "Five-field cron expression", "zh-CN": "五段式 Cron 表达式" },
  },
  timezone: {
    type: "string",
    valueHint: "<timezone>",
    description: { "en-US": "IANA schedule timezone", "zh-CN": "Schedule 的 IANA 时区" },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Deployment description", "zh-CN": "Deployment 描述" },
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
    "en-US": "Declare and create one Managed Agent Deployment through a scoped YAML apply",
    "zh-CN": "通过定向 YAML Apply 声明并创建一个托管 Agent Deployment",
  },
  auth: "apiKey",
  usageArgs:
    "--name <name> --agent <yaml-key> (--message <text>... | --event <json|@path>...) [--agent-version <number>] [--environment <yaml-key>] [--vault <yaml-key>...] [--resource <json|@path>...] [--schedule <cron> --timezone <timezone>] [--description <text>] [--metadata <key=value>...] [--file <path>] [--yes]",
  flags: FLAGS,
  exampleArgs: [
    {
      "en-US": '--name Daily --agent assistant --message "Generate the report"',
      "zh-CN": '--name Daily --agent assistant --message "生成报告"',
    },
    {
      "en-US":
        '--name Daily --agent assistant --event \'{"type":"system.message","content":"Be concise"}\' --yes',
      "zh-CN":
        '--name Daily --agent assistant --event \'{"type":"system.message","content":"保持简洁"}\' --yes',
    },
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    ...SCOPED_CREATE_NOTE,
    {
      "en-US":
        "Initial Events must contain 1-50 user.message/system.message entries. --resource accepts only File Resources in this release.",
      "zh-CN":
        "Initial Events 必须包含 1–50 条 user.message/system.message；本期 --resource 仅接受 File Resource。",
    },
    {
      "en-US":
        "Use either repeatable --message values or repeatable --event values; the two input forms cannot be mixed.",
      "zh-CN": "重复使用 --message 或重复使用 --event；两种输入形式不能混用。",
    },
  ],
  validate: (flags) => {
    if (!flags.name.trim()) return "--name must not be empty.";
    if (!flags.agent.trim()) return "--agent must not be empty.";
    if (flags.message?.length && flags.event?.length) {
      return "--message and --event cannot be used together.";
    }
    if (!flags.message?.length && !flags.event?.length)
      return "Pass at least one --message or --event.";
    if (Boolean(flags.schedule) !== Boolean(flags.timezone)) {
      return "--schedule and --timezone must be provided together.";
    }
    if (
      flags.agentVersion !== undefined &&
      (!Number.isInteger(flags.agentVersion) || flags.agentVersion < 1)
    ) {
      return "--agent-version must be a positive integer.";
    }
    return undefined;
  },
  async run(ctx) {
    const project = await loadScopedCreateProject(ctx, ctx.flags.file ?? "agents.yaml");
    const initialEvents = [
      ...(ctx.flags.message ?? []).map((content) => ({ type: "user.message" as const, content })),
      ...validateEvents(await parseJsonInputs(ctx.flags.event, "event")),
    ];
    if (initialEvents.length < 1 || initialEvents.length > 50) {
      throw new BailianError("Initial Events must contain 1-50 entries.", ExitCode.USAGE);
    }
    const resources = validateResources(await parseJsonInputs(ctx.flags.resource, "resource"));
    if (ctx.flags.schedule && ctx.flags.schedule.trim().split(/\s+/).length !== 5) {
      throw new BailianError("--schedule must be a five-field cron expression.", ExitCode.USAGE);
    }
    if (ctx.flags.timezone) validateTimezone(ctx.flags.timezone);

    const rawDeclaration: DeploymentDecl = {
      name: ctx.flags.name.trim(),
      agent: ctx.flags.agent,
      agent_version: ctx.flags.agentVersion,
      environment: ctx.flags.environment,
      vaults: ctx.flags.vault,
      resources,
      initial_events: initialEvents,
      schedule:
        ctx.flags.schedule && ctx.flags.timezone
          ? { expression: ctx.flags.schedule, timezone: ctx.flags.timezone }
          : undefined,
      description: ctx.flags.description,
      provider: project.provider,
      metadata: parseMetadata(ctx.flags.metadata),
    };
    const resolvedDeclaration = await resolveCandidateDeclaration({
      project,
      group: "deployments",
      rawDeclaration: rawDeclaration as unknown as Record<string, unknown>,
    });
    await runScopedTopLevelCreate({
      host: ctx,
      project,
      group: "deployments",
      resourceType: "deployment",
      displayName: ctx.flags.name.trim(),
      rawDeclaration: rawDeclaration as unknown as Record<string, unknown>,
      resolvedDeclaration,
      existingDeclarations: (project.config.deployments ?? {}) as unknown as Record<
        string,
        Record<string, unknown>
      >,
      effectiveName: (key, declaration) =>
        typeof declaration.name === "string" ? declaration.name : key,
      fallbackKey: "deployment",
      yes: ctx.flags.yes,
    });
  },
});

function validateEvents(
  values: unknown[],
): Array<{ type: "user.message" | "system.message"; content: string }> {
  return values.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BailianError("Each --event must be a JSON object.", ExitCode.USAGE);
    }
    const event = value as Record<string, unknown>;
    if (event.type !== "user.message" && event.type !== "system.message") {
      throw new BailianError(
        "--event type must be user.message or system.message.",
        ExitCode.USAGE,
      );
    }
    if (typeof event.content !== "string" || !event.content.trim()) {
      throw new BailianError("--event content must be a non-empty string.", ExitCode.USAGE);
    }
    return { type: event.type, content: event.content };
  });
}

function validateResources(values: unknown[]): NonNullable<DeploymentDecl["resources"]> {
  return values.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BailianError("Each --resource must be a JSON object.", ExitCode.USAGE);
    }
    const resource = value as Record<string, unknown>;
    if (resource.type !== "file") {
      throw new BailianError("--resource currently accepts only type=file.", ExitCode.USAGE);
    }
    const source = typeof resource.source === "string" ? resource.source : undefined;
    const fileId = typeof resource.file_id === "string" ? resource.file_id : undefined;
    if (Boolean(source) === Boolean(fileId)) {
      throw new BailianError(
        "A File Resource must provide exactly one of source or file_id.",
        ExitCode.USAGE,
      );
    }
    if (resource.mount_path !== undefined && typeof resource.mount_path !== "string") {
      throw new BailianError("File Resource mount_path must be a string.", ExitCode.USAGE);
    }
    return {
      type: "file" as const,
      source,
      file_id: fileId,
      mount_path: resource.mount_path as string | undefined,
    };
  });
}

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new BailianError(`Invalid IANA timezone: ${timezone}`, ExitCode.USAGE);
  }
}
