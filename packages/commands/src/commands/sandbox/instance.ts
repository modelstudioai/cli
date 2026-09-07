import {
  BailianError,
  detectOutputFormat,
  defineCommand,
  ExitCode,
  sandboxEndpoint,
  SANDBOX_PATHS,
  sandboxInstanceActionPath,
  sandboxInstancePath,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import {
  BODY_FLAG,
  displayValue,
  INSTANCE_TIMEOUT_FLAG,
  mergeObjectField,
  parseKeyValueEntries,
  readRequestBody,
  redactConnectionCredentials,
  redactRequestSecrets,
  resolveWorkspaceId,
  SANDBOX_NOTES,
  setDefined,
  SHOW_CREDENTIALS_FLAG,
  validateIntegerRange,
  WORKSPACE_FLAG,
  type JsonObject,
} from "./shared.ts";

interface SandboxInfo extends JsonObject {
  sandboxID?: string;
  templateID?: string;
  state?: string;
  cpuCount?: number;
  memoryMB?: number;
  startedAt?: string;
  endAt?: string;
}

const SANDBOX_ID_FLAG = {
  sandboxId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Sandbox instance ID", "zh-CN": "Sandbox 实例 ID" },
  },
} satisfies FlagsDef;

const CREATE_FLAGS = {
  ...WORKSPACE_FLAG,
  ...BODY_FLAG,
  templateId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Ready template ID; may alternatively be supplied as templateID in --body",
      "zh-CN": "已就绪的模版 ID；也可通过 --body 中的 templateID 提供",
    },
  },
  ...INSTANCE_TIMEOUT_FLAG,
  allowInternetAccess: {
    type: "boolean",
    valueHint: "<bool>",
    description: { "en-US": "Allow public internet access", "zh-CN": "允许访问公网" },
  },
  metadata: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US": "Instance metadata entry; repeat for multiple values",
      "zh-CN": "实例 Metadata 键值；可重复传入",
    },
  },
  env: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US": "Instance environment variable; repeat for multiple values",
      "zh-CN": "实例环境变量；可重复传入",
    },
  },
  autoPause: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Pause the instance when its timeout expires",
      "zh-CN": "实例超时后自动暂停",
    },
  },
  autoResume: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Automatically resume a paused instance when connecting",
      "zh-CN": "连接已暂停实例时自动恢复",
    },
  },
  allowOut: {
    type: "array",
    valueHint: "<address>",
    description: {
      "en-US": "Outbound allow-list entry; repeat for multiple values",
      "zh-CN": "出站白名单条目；可重复传入",
    },
  },
  denyOut: {
    type: "array",
    valueHint: "<address>",
    description: {
      "en-US": "Outbound deny-list entry; repeat for multiple values",
      "zh-CN": "出站黑名单条目；可重复传入",
    },
  },
  maskRequestHost: {
    type: "string",
    valueHint: "<host>",
    description: {
      "en-US": "Override the outbound request Host header",
      "zh-CN": "覆盖出站请求的 Host Header",
    },
  },
  ...SHOW_CREDENTIALS_FLAG,
} satisfies FlagsDef;

type CreateFlags = ParsedFlags<typeof CREATE_FLAGS>;

const LIST_FLAGS = {
  ...WORKSPACE_FLAG,
  templateId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Filter by template ID", "zh-CN": "按模版 ID 筛选" },
  },
  sandboxId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Filter by sandbox ID", "zh-CN": "按 Sandbox ID 筛选" },
  },
  state: {
    type: "string",
    valueHint: "<state>",
    description: {
      "en-US": "Filter by state, for example running or paused",
      "zh-CN": "按状态筛选，例如 running 或 paused",
    },
  },
  limit: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Maximum results (1-50)", "zh-CN": "最大返回数量（1–50）" },
  },
} satisfies FlagsDef;

const GET_FLAGS = {
  ...WORKSPACE_FLAG,
  ...SANDBOX_ID_FLAG,
  ...SHOW_CREDENTIALS_FLAG,
} satisfies FlagsDef;
const ACTION_FLAGS = { ...WORKSPACE_FLAG, ...SANDBOX_ID_FLAG } satisfies FlagsDef;
const CONNECTION_ACTION_FLAGS = {
  ...WORKSPACE_FLAG,
  ...SANDBOX_ID_FLAG,
  ...BODY_FLAG,
  ...INSTANCE_TIMEOUT_FLAG,
  ...SHOW_CREDENTIALS_FLAG,
} satisfies FlagsDef;

export async function buildSandboxCreateBody(flags: CreateFlags): Promise<JsonObject> {
  const body = await readRequestBody(flags.body);
  setDefined(body, "templateID", flags.templateId);
  setDefined(body, "timeout", flags.instanceTimeout);
  setDefined(body, "allow_internet_access", flags.allowInternetAccess);
  setDefined(body, "autoPause", flags.autoPause);
  setDefined(body, "autoResume", flags.autoResume);
  mergeObjectField(body, "metadata", parseKeyValueEntries(flags.metadata, "--metadata"));
  mergeObjectField(body, "envVars", parseKeyValueEntries(flags.env, "--env"));

  const networkOverrides: JsonObject = {};
  setDefined(networkOverrides, "allowOut", flags.allowOut);
  setDefined(networkOverrides, "denyOut", flags.denyOut);
  setDefined(networkOverrides, "maskRequestHost", flags.maskRequestHost);
  mergeObjectField(body, "network", networkOverrides);

  if (typeof body.templateID !== "string" || body.templateID.trim().length === 0) {
    throw new BailianError(
      "Sandbox create requires --template-id or templateID in --body.",
      ExitCode.USAGE,
    );
  }
  validateIntegerRange(body.timeout, "Sandbox timeout", 300, 604800);
  return body;
}

async function buildConnectionBody(flags: {
  body?: string;
  instanceTimeout?: number;
}): Promise<JsonObject> {
  const body = await readRequestBody(flags.body);
  setDefined(body, "timeout", flags.instanceTimeout);
  validateIntegerRange(body.timeout, "Sandbox timeout", 300, 604800);
  return body;
}

function emitSandboxObject(
  sandbox: SandboxInfo,
  options: { format: "text" | "json"; quiet: boolean; showCredentials: boolean },
): void {
  const output = options.showCredentials ? sandbox : redactConnectionCredentials(sandbox);
  if (options.quiet) {
    emitBare(displayValue(sandbox.sandboxID));
    return;
  }
  emitResult(output, options.format);
}

export const sandboxCreate = defineCommand({
  description: { "en-US": "Create a Sandbox instance", "zh-CN": "创建 Sandbox 实例" },
  auth: "apiKey",
  usageArgs: "(--template-id <id> | --body <json|@path>) [flags]",
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--template-id tpl-xxx --instance-timeout 3600",
    "--body @sandbox.json --dry-run --output json",
    "--template-id tpl-xxx --show-credentials --output json",
  ],
  notes: SANDBOX_NOTES,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const workspaceId = resolveWorkspaceId(ctx);
    const endpoint = sandboxEndpoint(workspaceId, SANDBOX_PATHS.sandboxes);
    const body = await buildSandboxCreateBody(ctx.flags);
    if (ctx.settings.dryRun) {
      emitResult({ method: "POST", endpoint, request: redactRequestSecrets(body) }, format);
      return;
    }
    const response = await ctx.client.requestJson<SandboxInfo>({
      path: endpoint,
      method: "POST",
      body,
    });
    emitSandboxObject(response, {
      format,
      quiet: ctx.settings.quiet,
      showCredentials: ctx.flags.showCredentials,
    });
  },
});

export const sandboxList = defineCommand({
  description: { "en-US": "List Sandbox instances", "zh-CN": "列出 Sandbox 实例" },
  auth: "apiKey",
  usageArgs: "[--template-id <id>] [--sandbox-id <id>] [--state <state>] [--limit <n>]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--state running --limit 20", "--template-id tpl-xxx --output json"],
  notes: SANDBOX_NOTES,
  validate(flags) {
    if (
      flags.limit !== undefined &&
      (!Number.isInteger(flags.limit) || flags.limit < 1 || flags.limit > 50)
    ) {
      return "--limit must be an integer between 1 and 50.";
    }
    return undefined;
  },
  async run(ctx) {
    const workspaceId = resolveWorkspaceId(ctx);
    const url = new URL(sandboxEndpoint(workspaceId, SANDBOX_PATHS.sandboxList));
    if (ctx.flags.templateId) url.searchParams.set("templateID", ctx.flags.templateId);
    if (ctx.flags.sandboxId) url.searchParams.set("sandboxID", ctx.flags.sandboxId);
    if (ctx.flags.state) url.searchParams.set("state", ctx.flags.state);
    if (ctx.flags.limit !== undefined) url.searchParams.set("limit", String(ctx.flags.limit));
    const response = await ctx.client.requestJson<SandboxInfo[]>({
      path: url.toString(),
      method: "GET",
    });
    if (ctx.settings.quiet) {
      for (const sandbox of response) emitBare(displayValue(sandbox.sandboxID));
      return;
    }
    const format = detectOutputFormat(ctx.settings.output);
    if (format === "json") {
      emitResult(response, format);
      return;
    }
    if (response.length === 0) {
      emitBare("No Sandbox instances found.");
      return;
    }
    const rows = response.map((sandbox) => [
      displayValue(sandbox.sandboxID),
      displayValue(sandbox.templateID),
      displayValue(sandbox.state),
      displayValue(sandbox.cpuCount),
      displayValue(sandbox.memoryMB),
      displayValue(sandbox.startedAt),
      displayValue(sandbox.endAt),
    ]);
    for (const line of formatTable(
      ["ID", "TEMPLATE", "STATE", "CPU", "MEMORY_MB", "STARTED_AT", "END_AT"],
      rows,
    )) {
      emitBare(line);
    }
  },
});

export const sandboxGet = defineCommand({
  description: { "en-US": "Get Sandbox instance details", "zh-CN": "获取 Sandbox 实例详情" },
  auth: "apiKey",
  usageArgs: "--sandbox-id <id> [--show-credentials]",
  flags: GET_FLAGS,
  exampleArgs: ["--sandbox-id sbx-xxx", "--sandbox-id sbx-xxx --show-credentials --output json"],
  notes: SANDBOX_NOTES,
  async run(ctx) {
    const workspaceId = resolveWorkspaceId(ctx);
    const endpoint = sandboxEndpoint(workspaceId, sandboxInstancePath(ctx.flags.sandboxId));
    const response = await ctx.client.requestJson<SandboxInfo>({ path: endpoint, method: "GET" });
    emitSandboxObject(response, {
      format: detectOutputFormat(ctx.settings.output),
      quiet: ctx.settings.quiet,
      showCredentials: ctx.flags.showCredentials,
    });
  },
});

function connectionCommand(action: "connect" | "resume") {
  const actionText = action === "connect" ? "Connect to" : "Resume";
  const actionTextZh = action === "connect" ? "连接" : "恢复";
  return defineCommand({
    description: {
      "en-US": `${actionText} a Sandbox instance and return connection information`,
      "zh-CN": `${actionTextZh} Sandbox 实例并返回连接信息`,
    },
    auth: "apiKey",
    usageArgs: "--sandbox-id <id> [--instance-timeout <seconds>] [--show-credentials]",
    flags: CONNECTION_ACTION_FLAGS,
    exampleArgs: [
      `--sandbox-id sbx-xxx --instance-timeout 3600`,
      `--sandbox-id sbx-xxx --show-credentials --output json`,
    ],
    notes: SANDBOX_NOTES,
    async run(ctx) {
      const format = detectOutputFormat(ctx.settings.output);
      const workspaceId = resolveWorkspaceId(ctx);
      const endpoint = sandboxEndpoint(
        workspaceId,
        sandboxInstanceActionPath(ctx.flags.sandboxId, action),
      );
      const body = await buildConnectionBody(ctx.flags);
      if (ctx.settings.dryRun) {
        emitResult({ method: "POST", endpoint, request: redactRequestSecrets(body) }, format);
        return;
      }
      const response = await ctx.client.requestJson<SandboxInfo>({
        path: endpoint,
        method: "POST",
        body: Object.keys(body).length > 0 ? body : undefined,
      });
      emitSandboxObject(response, {
        format,
        quiet: ctx.settings.quiet,
        showCredentials: ctx.flags.showCredentials,
      });
    },
  });
}

export const sandboxConnect = connectionCommand("connect");
export const sandboxResume = connectionCommand("resume");

export const sandboxPause = defineCommand({
  description: { "en-US": "Pause a Sandbox instance", "zh-CN": "暂停 Sandbox 实例" },
  auth: "apiKey",
  usageArgs: "--sandbox-id <id>",
  flags: ACTION_FLAGS,
  exampleArgs: ["--sandbox-id sbx-xxx", "--sandbox-id sbx-xxx --dry-run --output json"],
  notes: SANDBOX_NOTES,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const workspaceId = resolveWorkspaceId(ctx);
    const endpoint = sandboxEndpoint(
      workspaceId,
      sandboxInstanceActionPath(ctx.flags.sandboxId, "pause"),
    );
    if (ctx.settings.dryRun) {
      emitResult({ method: "POST", endpoint, request: null }, format);
      return;
    }
    await ctx.client.request({ path: endpoint, method: "POST" });
    if (ctx.settings.quiet) emitBare(ctx.flags.sandboxId);
    else emitResult({ sandboxID: ctx.flags.sandboxId, paused: true }, format);
  },
});

export const sandboxDelete = defineCommand({
  description: { "en-US": "Release a Sandbox instance", "zh-CN": "释放 Sandbox 实例" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently releases the Sandbox instance and cannot be undone.",
      "zh-CN": "该操作会永久释放 Sandbox 实例，且无法撤销。",
    },
  },
  usageArgs: "--sandbox-id <id>",
  flags: ACTION_FLAGS,
  exampleArgs: ["--sandbox-id sbx-xxx --dry-run", "--sandbox-id sbx-xxx --yes"],
  notes: SANDBOX_NOTES,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const workspaceId = resolveWorkspaceId(ctx);
    const endpoint = sandboxEndpoint(workspaceId, sandboxInstancePath(ctx.flags.sandboxId));
    if (ctx.settings.dryRun) {
      emitResult({ method: "DELETE", endpoint, request: null }, format);
      return;
    }
    await ctx.client.request({ path: endpoint, method: "DELETE" });
    if (ctx.settings.quiet) emitBare(ctx.flags.sandboxId);
    else emitResult({ sandboxID: ctx.flags.sandboxId, deleted: true }, format);
  },
});
