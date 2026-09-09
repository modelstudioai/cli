import {
  BailianError,
  detectOutputFormat,
  defineCommand,
  ExitCode,
  sandboxApiPath,
  SANDBOX_PATHS,
  sandboxTemplateBuildStatusPath,
  sandboxTemplatePath,
  type Client,
  type FlagsDef,
  type ParsedFlags,
  type Settings,
} from "bailian-cli-core";
import { createSpinner, emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { resolveSandboxImage, SANDBOX_IMAGE_CHOICES, SANDBOX_IMAGE_NOTES } from "./images.ts";
import {
  BODY_FLAG,
  displayValue,
  mergeObjectField,
  parseKeyValueEntries,
  POLL_INTERVAL_FLAG,
  readRequestBody,
  redactRequestSecrets,
  resolveSandboxEndpoint,
  SANDBOX_NOTES,
  setDefined,
  validateIntegerRange,
  validatePositiveInteger,
  WORKSPACE_FLAG,
  type JsonObject,
} from "./shared.ts";

const TEMPLATE_ASYNC_FLAG = {
  async: {
    type: "switch",
    description: {
      "en-US": "Return the submitted templateID/buildID immediately without polling",
      "zh-CN": "提交后立即返回 templateID/buildID，不轮询构建状态",
    },
  },
} satisfies FlagsDef;

interface TemplateInfo extends JsonObject {
  templateID?: string;
  templateName?: string;
  cpuCount?: number;
  memoryMB?: number;
  spawnCount?: number;
  buildCount?: number;
  updatedAt?: string;
  buildID?: string;
  buildStatus?: string;
}

interface TemplateBuildStatus extends JsonObject {
  templateID?: string;
  buildID?: string;
  status?: "building" | "ready" | "error";
  reason?: { code?: number | string; message?: string };
}

const TEMPLATE_ID_FLAG = {
  templateId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Sandbox template ID", "zh-CN": "Sandbox 模版 ID" },
  },
} satisfies FlagsDef;

const TEMPLATE_MUTATION_FIELDS = {
  image: {
    type: "string",
    valueHint: "<preset>",
    choices: SANDBOX_IMAGE_CHOICES,
    description: {
      "en-US": "Built-in image ID or Chinese name; fills fromImage and imageName",
      "zh-CN": "内置镜像 ID 或中文名；自动填写 fromImage 和 imageName",
    },
  },
  name: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Template name", "zh-CN": "模版名称" },
  },
  cpuCount: {
    type: "number",
    valueHint: "<cores>",
    description: { "en-US": "vCPU count", "zh-CN": "vCPU 核数" },
  },
  memoryMb: {
    type: "number",
    valueHint: "<mb>",
    description: { "en-US": "Memory in MB", "zh-CN": "内存大小（MB）" },
  },
  fromImage: {
    type: "string",
    valueHint: "<image>",
    description: { "en-US": "Base image identifier", "zh-CN": "基础镜像标识" },
  },
  imageName: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Base image display name", "zh-CN": "基础镜像展示名称" },
  },
  env: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US": "Template environment variable; repeat for multiple values",
      "zh-CN": "模版环境变量；可重复传入",
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
  autoPauseTime: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Automatically pause after 300-604800 seconds",
      "zh-CN": "在 300–604800 秒后自动暂停",
    },
  },
  maxRunningTime: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Maximum running lifetime in seconds (300-604800)",
      "zh-CN": "最大运行时间（秒，300–604800）",
    },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Template description", "zh-CN": "模版描述" },
  },
} satisfies FlagsDef;

const CREATE_FLAGS = {
  ...WORKSPACE_FLAG,
  ...BODY_FLAG,
  ...TEMPLATE_MUTATION_FIELDS,
  tag: {
    type: "array",
    valueHint: "<tag>",
    description: { "en-US": "E2B tag; repeat for multiple values", "zh-CN": "E2B Tag；可重复传入" },
  },
  alias: {
    type: "string",
    valueHint: "<alias>",
    description: { "en-US": "E2B template alias", "zh-CN": "E2B 模版别名" },
  },
  ...TEMPLATE_ASYNC_FLAG,
  ...POLL_INTERVAL_FLAG,
} satisfies FlagsDef;

const UPDATE_FLAGS = {
  ...WORKSPACE_FLAG,
  ...TEMPLATE_ID_FLAG,
  ...BODY_FLAG,
  ...TEMPLATE_MUTATION_FIELDS,
  ...TEMPLATE_ASYNC_FLAG,
  ...POLL_INTERVAL_FLAG,
} satisfies FlagsDef;

type CreateFlags = ParsedFlags<typeof CREATE_FLAGS>;
type UpdateFlags = ParsedFlags<typeof UPDATE_FLAGS>;

const LIST_FLAGS = {
  ...WORKSPACE_FLAG,
  limit: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Maximum results (1-100)", "zh-CN": "最大返回数量（1–100）" },
  },
  cursor: {
    type: "string",
    valueHint: "<cursor>",
    description: { "en-US": "Server-side pagination cursor", "zh-CN": "服务端分页 Cursor" },
  },
} satisfies FlagsDef;

const GET_FLAGS = { ...WORKSPACE_FLAG, ...TEMPLATE_ID_FLAG } satisfies FlagsDef;
const BUILD_STATUS_FLAGS = {
  ...WORKSPACE_FLAG,
  ...TEMPLATE_ID_FLAG,
  buildId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Template build ID", "zh-CN": "模版构建 ID" },
  },
} satisfies FlagsDef;

function applyTemplateMutationFlags(body: JsonObject, flags: CreateFlags | UpdateFlags): void {
  if (flags.image !== undefined) {
    const image = resolveSandboxImage(flags.image);
    body.fromImage = image.imageUrl;
    body.imageName = image.imageName;
  }
  setDefined(body, "name", flags.name);
  setDefined(body, "cpuCount", flags.cpuCount);
  setDefined(body, "memoryMB", flags.memoryMb);
  setDefined(body, "fromImage", flags.fromImage);
  setDefined(body, "imageName", flags.imageName);
  setDefined(body, "autoPauseTime", flags.autoPauseTime);
  setDefined(body, "maxRunningTimeout", flags.maxRunningTime);
  setDefined(body, "description", flags.description);
  mergeObjectField(body, "envConfig", parseKeyValueEntries(flags.env, "--env"));

  const networkOverrides: JsonObject = {};
  setDefined(networkOverrides, "allowOut", flags.allowOut);
  setDefined(networkOverrides, "denyOut", flags.denyOut);
  mergeObjectField(body, "networkConfig", networkOverrides);
}

function validateTemplateMutationBody(body: JsonObject, create: boolean): void {
  if (create && (typeof body.name !== "string" || body.name.trim().length === 0)) {
    throw new BailianError("Template create requires --name or name in --body.", ExitCode.USAGE);
  }

  const hasCpu = body.cpuCount !== undefined;
  const hasMemory = body.memoryMB !== undefined;
  if (create && (!hasCpu || !hasMemory)) {
    throw new BailianError(
      "Template create requires both --cpu-count and --memory-mb, or their --body fields.",
      ExitCode.USAGE,
    );
  }
  if (hasCpu !== hasMemory) {
    throw new BailianError("cpuCount and memoryMB must be provided together.", ExitCode.USAGE);
  }
  if (hasCpu) validatePositiveInteger(body.cpuCount, "cpuCount");
  if (hasMemory) validatePositiveInteger(body.memoryMB, "memoryMB");
  validateIntegerRange(body.autoPauseTime, "autoPauseTime", 300, 604800);
  validateIntegerRange(body.maxRunningTimeout, "maxRunningTimeout", 300, 604800);
  if (!create && Object.keys(body).length === 0) {
    throw new BailianError("Template update requires at least one field.", ExitCode.USAGE);
  }
}

export async function buildTemplateCreateBody(flags: CreateFlags): Promise<JsonObject> {
  const body = await readRequestBody(flags.body);
  applyTemplateMutationFlags(body, flags);
  setDefined(body, "tags", flags.tag);
  setDefined(body, "alias", flags.alias);
  validateTemplateMutationBody(body, true);
  return body;
}

export async function buildTemplateUpdateBody(flags: UpdateFlags): Promise<JsonObject> {
  const body = await readRequestBody(flags.body);
  applyTemplateMutationFlags(body, flags);
  validateTemplateMutationBody(body, false);
  return body;
}

export async function waitForTemplateBuild(
  client: Client,
  settings: Settings,
  endpoint: string,
  intervalSec: number,
): Promise<TemplateBuildStatus> {
  const deadline = Date.now() + settings.timeout * 1000;
  const spinner = createSpinner("Waiting for template build...");
  if (!settings.quiet) spinner.start();
  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      const status = await client.requestJson<TemplateBuildStatus>({
        path: endpoint,
        method: "GET",
        timeout: remainingMs / 1000,
      });
      if (!settings.quiet) spinner.update(`Build status: ${status.status ?? "unknown"}`);
      if (status.status === "ready") {
        spinner.stop("Template build ready.");
        return status;
      }
      if (status.status === "error") {
        spinner.stop("Template build failed.");
        const reason =
          status.reason?.message ??
          (status.reason?.code !== undefined ? `${status.reason.code}` : "Template build failed.");
        throw new BailianError(reason, ExitCode.GENERAL);
      }
      const sleepMs = Math.min(intervalSec * 1000, deadline - Date.now());
      if (sleepMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, sleepMs));
      }
    }
  } finally {
    spinner.stop();
  }
  throw new BailianError(
    "Template build polling timed out.",
    ExitCode.TIMEOUT,
    "Increase --timeout or query the build status command with the returned IDs.",
  );
}

function validatePollInterval(flags: { pollInterval?: number }): string | undefined {
  if (
    flags.pollInterval !== undefined &&
    (!Number.isInteger(flags.pollInterval) || flags.pollInterval <= 0)
  ) {
    return "--poll-interval must be a positive integer.";
  }
  return undefined;
}

async function emitTemplateMutationResult(options: {
  response: TemplateInfo;
  endpoint: string;
  client: Client;
  settings: Settings;
  async: boolean;
  pollInterval?: number;
}): Promise<void> {
  const format = detectOutputFormat(options.settings.output);
  if (!options.response.templateID || !options.response.buildID) {
    throw new BailianError(
      "Template mutation response is missing templateID or buildID.",
      ExitCode.GENERAL,
    );
  }
  if (options.async) {
    if (options.settings.quiet) {
      emitBare(`${options.response.templateID}\t${options.response.buildID}`);
    } else {
      emitResult(options.response, format);
    }
    return;
  }
  // Poll the same origin that accepted the build, including custom gateways.
  const buildEndpoint = new URL(
    sandboxApiPath(
      sandboxTemplateBuildStatusPath(options.response.templateID, options.response.buildID),
    ),
    options.endpoint,
  ).toString();
  const build = await waitForTemplateBuild(
    options.client,
    options.settings,
    buildEndpoint,
    options.pollInterval ?? 5,
  );
  if (options.settings.quiet) emitBare(displayValue(options.response.templateID));
  else emitResult({ template: options.response, build }, format);
}

export const sandboxTemplateCreate = defineCommand({
  description: { "en-US": "Create a Sandbox template", "zh-CN": "创建 Sandbox 模版" },
  auth: "apiKey",
  usageArgs: "(--name <name> --cpu-count <cores> --memory-mb <mb> | --body <json|@path>) [flags]",
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--name browser --image browser --cpu-count 1 --memory-mb 2048",
    "--name python --cpu-count 1 --memory-mb 2048",
    "--body @template.json --async --output json",
    "--name browser --cpu-count 4 --memory-mb 8192 --dry-run --output json",
  ],
  notes: [
    ...SANDBOX_NOTES,
    ...SANDBOX_IMAGE_NOTES,
    {
      "en-US":
        "--image overrides body fromImage/imageName; explicit --from-image/--image-name override the corresponding preset fields. Without --image, image behavior is unchanged.",
      "zh-CN":
        "--image 覆盖 body 中的 fromImage/imageName；显式 --from-image/--image-name 再覆盖对应预设字段。不传 --image 时保持原有镜像行为。",
    },
    {
      "en-US":
        "For local file mounts, use sandbox file upload first; put the available file's id into --body mntConfig[].originFileId with mountPath and optional originFileName. Upload and template must use the same workspace. Other complete nested structures can also be supplied through --body.",
      "zh-CN":
        "挂载本地文件前先调用 sandbox file upload；将可用文件的 id 填入 --body 的 mntConfig[].originFileId，并传入 mountPath 和可选的 originFileName。上传和模版须位于同一工作空间。其他完整嵌套结构也可通过 --body 提供。",
    },
    {
      "en-US":
        "By default the command waits for build status ready; --async returns the submitted build immediately.",
      "zh-CN": "默认等待构建状态变为 ready；--async 会立即返回已提交的构建信息。",
    },
  ],
  validate: validatePollInterval,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const endpoint = resolveSandboxEndpoint(ctx, SANDBOX_PATHS.templateCreate);
    const body = await buildTemplateCreateBody(ctx.flags);
    if (ctx.settings.dryRun) {
      emitResult({ method: "POST", endpoint, request: redactRequestSecrets(body) }, format);
      return;
    }
    const response = await ctx.client.requestJson<TemplateInfo>({
      path: endpoint,
      method: "POST",
      body,
    });
    await emitTemplateMutationResult({
      response,
      endpoint,
      client: ctx.client,
      settings: ctx.settings,
      async: ctx.flags.async,
      pollInterval: ctx.flags.pollInterval,
    });
  },
});

export const sandboxTemplateList = defineCommand({
  description: { "en-US": "List Sandbox templates", "zh-CN": "列出 Sandbox 模版" },
  auth: "apiKey",
  usageArgs: "[--limit <n>] [--cursor <cursor>]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--limit 100 --output json"],
  notes: [
    ...SANDBOX_NOTES,
    {
      "en-US":
        "The API response does not expose a next cursor, so automatic --all pagination is unavailable.",
      "zh-CN": "API 响应未提供下一页 Cursor，因此不支持自动 --all 翻页。",
    },
  ],
  validate(flags) {
    if (
      flags.limit !== undefined &&
      (!Number.isInteger(flags.limit) || flags.limit < 1 || flags.limit > 100)
    ) {
      return "--limit must be an integer between 1 and 100.";
    }
    return undefined;
  },
  async run(ctx) {
    const url = new URL(resolveSandboxEndpoint(ctx, SANDBOX_PATHS.templateList));
    if (ctx.flags.limit !== undefined) url.searchParams.set("limit", String(ctx.flags.limit));
    if (ctx.flags.cursor) url.searchParams.set("cursor", ctx.flags.cursor);
    const response = await ctx.client.requestJson<TemplateInfo[]>({
      path: url.toString(),
      method: "GET",
    });
    if (ctx.settings.quiet) {
      for (const template of response) emitBare(displayValue(template.templateID));
      return;
    }
    const format = detectOutputFormat(ctx.settings.output);
    if (format === "json") {
      emitResult(response, format);
      return;
    }
    if (response.length === 0) {
      emitBare("No Sandbox templates found.");
      return;
    }
    const rows = response.map((template) => [
      displayValue(template.templateID),
      displayValue(template.templateName),
      displayValue(template.cpuCount),
      displayValue(template.memoryMB),
      displayValue(template.spawnCount),
      displayValue(template.buildCount),
      displayValue(template.updatedAt),
    ]);
    for (const line of formatTable(
      ["ID", "NAME", "CPU", "MEMORY_MB", "INSTANCES", "BUILDS", "UPDATED_AT"],
      rows,
    )) {
      emitBare(line);
    }
  },
});

export const sandboxTemplateGet = defineCommand({
  description: { "en-US": "Get Sandbox template details", "zh-CN": "获取 Sandbox 模版详情" },
  auth: "apiKey",
  usageArgs: "--template-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--template-id tpl-xxx", "--template-id tpl-xxx --output json"],
  notes: SANDBOX_NOTES,
  async run(ctx) {
    const endpoint = resolveSandboxEndpoint(ctx, sandboxTemplatePath(ctx.flags.templateId));
    const response = await ctx.client.requestJson<TemplateInfo>({ path: endpoint, method: "GET" });
    if (ctx.settings.quiet) emitBare(displayValue(response.templateID));
    else emitResult(response, detectOutputFormat(ctx.settings.output));
  },
});

export const sandboxTemplateUpdate = defineCommand({
  description: { "en-US": "Update a Sandbox template", "zh-CN": "更新 Sandbox 模版" },
  auth: "apiKey",
  usageArgs: "--template-id <id> (--body <json|@path> | [fields])",
  flags: UPDATE_FLAGS,
  exampleArgs: [
    "--template-id tpl-xxx --image all-in-one",
    "--template-id tpl-xxx --cpu-count 4 --memory-mb 8192",
    "--template-id tpl-xxx --body @template-update.json --async --output json",
    "--template-id tpl-xxx --description updated --dry-run --output json",
  ],
  notes: [
    ...SANDBOX_NOTES,
    ...SANDBOX_IMAGE_NOTES,
    {
      "en-US":
        "--image overrides body fromImage/imageName; explicit --from-image/--image-name override the corresponding preset fields. Without --image, image behavior is unchanged.",
      "zh-CN":
        "--image 覆盖 body 中的 fromImage/imageName；显式 --from-image/--image-name 再覆盖对应预设字段。不传 --image 时保持原有镜像行为。",
    },
    {
      "en-US": "Supplying envConfig or --env replaces the template's complete environment map.",
      "zh-CN": "传入 envConfig 或 --env 会整体替换模版的环境变量 Map。",
    },
    {
      "en-US":
        "Use sandbox file upload for local mount files. In --body mntConfig[], set originFileId to the available file's id and supply mountPath; upload and template must use the same workspace.",
      "zh-CN":
        "本地挂载文件先通过 sandbox file upload 上传。在 --body 的 mntConfig[] 中，将 originFileId 设为可用文件的 id 并传入 mountPath；上传和模版须位于同一工作空间。",
    },
    {
      "en-US":
        "By default the command waits for build status ready; --async returns the submitted build immediately.",
      "zh-CN": "默认等待构建状态变为 ready；--async 会立即返回已提交的构建信息。",
    },
  ],
  validate: validatePollInterval,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const endpoint = resolveSandboxEndpoint(ctx, sandboxTemplatePath(ctx.flags.templateId));
    const body = await buildTemplateUpdateBody(ctx.flags);
    if (ctx.settings.dryRun) {
      emitResult({ method: "PUT", endpoint, request: redactRequestSecrets(body) }, format);
      return;
    }
    const response = await ctx.client.requestJson<TemplateInfo>({
      path: endpoint,
      method: "PUT",
      body,
    });
    await emitTemplateMutationResult({
      response,
      endpoint,
      client: ctx.client,
      settings: ctx.settings,
      async: ctx.flags.async,
      pollInterval: ctx.flags.pollInterval,
    });
  },
});

export const sandboxTemplateBuildStatus = defineCommand({
  description: {
    "en-US": "Get Sandbox template build status",
    "zh-CN": "获取 Sandbox 模版构建状态",
  },
  auth: "apiKey",
  usageArgs: "--template-id <id> --build-id <id>",
  flags: BUILD_STATUS_FLAGS,
  exampleArgs: [
    "--template-id tpl-xxx --build-id build-xxx",
    "--template-id tpl-xxx --build-id build-xxx --output json",
  ],
  notes: SANDBOX_NOTES,
  async run(ctx) {
    const endpoint = resolveSandboxEndpoint(
      ctx,
      sandboxTemplateBuildStatusPath(ctx.flags.templateId, ctx.flags.buildId),
    );
    const response = await ctx.client.requestJson<TemplateBuildStatus>({
      path: endpoint,
      method: "GET",
    });
    if (ctx.settings.quiet) emitBare(displayValue(response.status));
    else emitResult(response, detectOutputFormat(ctx.settings.output));
  },
});

export const sandboxTemplateDelete = defineCommand({
  description: { "en-US": "Delete a Sandbox template", "zh-CN": "删除 Sandbox 模版" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently deletes the Sandbox template and cannot be undone.",
      "zh-CN": "该操作会永久删除 Sandbox 模版，且无法撤销。",
    },
  },
  usageArgs: "--template-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--template-id tpl-xxx --dry-run", "--template-id tpl-xxx --yes"],
  notes: [
    ...SANDBOX_NOTES,
    {
      "en-US":
        "The server rejects deletion while running or paused instances still use the template.",
      "zh-CN": "仍有运行中或已暂停实例使用该模版时，服务端会拒绝删除。",
    },
  ],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const endpoint = resolveSandboxEndpoint(ctx, sandboxTemplatePath(ctx.flags.templateId));
    if (ctx.settings.dryRun) {
      emitResult({ method: "DELETE", endpoint, request: null }, format);
      return;
    }
    await ctx.client.request({ path: endpoint, method: "DELETE" });
    if (ctx.settings.quiet) emitBare(ctx.flags.templateId);
    else emitResult({ templateID: ctx.flags.templateId, deleted: true }, format);
  },
});
