import { readFile } from "node:fs/promises";
import {
  createMemory,
  deleteMemory,
  getMemory,
  getMemoryStore,
  getMemoryVersion,
  listMemories,
  listMemoryStores,
  listMemoryVersions,
  redactMemoryVersion,
  updateMemory,
} from "@openagentpack/sdk";
import {
  defineCommand,
  detectOutputFormat,
  type CommandRisk,
  type FlagsDef,
  type LocalizedText,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import {
  buildManagedApiContext,
  resolveManagedApiBaseUrl,
  type ManagedApiHost,
} from "../_engine/managed-api-context.ts";

const WORKSPACE_FLAGS = {
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Workspace ID; optional with a configured Base URL",
      "zh-CN": "Workspace ID；已配置 Base URL 时可省略",
    },
  },
} as const satisfies FlagsDef;
const STORE_FLAGS = {
  ...WORKSPACE_FLAGS,
  storeId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Remote Memory Store ID", "zh-CN": "远端记忆库 ID" },
  },
} as const satisfies FlagsDef;
const MEMORY_FLAGS = {
  ...STORE_FLAGS,
  memoryId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Remote Memory ID", "zh-CN": "远端记忆条目 ID" },
  },
} as const satisfies FlagsDef;
const VERSION_FLAGS = {
  ...STORE_FLAGS,
  versionId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Remote Memory Version ID", "zh-CN": "远端记忆版本 ID" },
  },
} as const satisfies FlagsDef;
const PAGE_FLAGS = {
  limit: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page size (1–100)", "zh-CN": "单页数量（1–100）" },
  },
  page: {
    type: "string",
    valueHint: "<cursor>",
    description: {
      "en-US": "Opaque next_page cursor from the previous response",
      "zh-CN": "上次响应中的不透明 next_page 游标",
    },
  },
} as const satisfies FlagsDef;
const VIEW_FLAGS = {
  view: {
    type: "string",
    valueHint: "<basic|full>",
    choices: ["basic", "full"],
    description: { "en-US": "Response view (basic or full)", "zh-CN": "响应视图（basic 或 full）" },
  },
} as const satisfies FlagsDef;
const CONTENT_FLAGS = {
  content: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Memory content; an empty string is allowed",
      "zh-CN": "记忆正文；允许空字符串",
    },
  },
  contentFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Read UTF-8 content from a local file; exclusive with --content",
      "zh-CN": "从本地文件读取 UTF-8 正文；与 --content 互斥",
    },
  },
} as const satisfies FlagsDef;
const PATH_FLAG = {
  path: {
    type: "string",
    valueHint: "<path>",
    description: { "en-US": "Memory file path", "zh-CN": "记忆文件路径" },
  },
} as const satisfies FlagsDef;
const SHA_FLAGS = {
  expectedContentSha256: {
    type: "string",
    valueHint: "<sha256>",
    description: {
      "en-US": "Expected current SHA-256; reject a concurrent content change",
      "zh-CN": "预期当前 SHA-256；并发内容变化时拒绝更新",
    },
  },
} as const satisfies FlagsDef;
const API_NOTES: LocalizedText[] = [
  {
    "en-US":
      "Calls the SDK with the CLI API Key and workspace settings; no agents.yaml or State is required for reading stores or managing their contents.",
    "zh-CN":
      "使用 CLI API Key 和工作空间配置调用 SDK；查询记忆库和管理正文无需 agents.yaml 或 State。",
  },
  {
    "en-US":
      "Store lifecycle remains in agents.yaml. Pass the remote Store ID to these API commands and pass next_page back unchanged.",
    "zh-CN":
      "记忆库生命周期仍由 agents.yaml 管理。这些 API 命令使用远端 Store ID；next_page 游标保持原样传回。",
  },
];
const WRITE_RISK: CommandRisk = {
  level: "high",
  message: {
    "en-US":
      "This changes persistent memory content. Review the dry-run request before confirming.",
    "zh-CN": "该操作会修改持久化记忆正文。请先核对 dry-run 请求，再确认执行。",
  },
};

interface MemoryFlags {
  workspaceId?: string;
  storeId?: string;
  memoryId?: string;
  versionId?: string;
  limit?: number;
  page?: string;
  depth?: number;
  path?: string;
  content?: string;
  contentFile?: string;
  expectedContentSha256?: string;
  createdAtGte?: string;
  createdAtLte?: string;
}
function validateFlags(flags: MemoryFlags, maxLimit = 100): string | undefined {
  for (const [key, value] of Object.entries({
    "workspace-id": flags.workspaceId,
    "store-id": flags.storeId,
    "memory-id": flags.memoryId,
    "version-id": flags.versionId,
    page: flags.page,
    path: flags.path,
    "content-file": flags.contentFile,
  })) {
    if (value !== undefined && !value.trim())
      return `--${key} must not be empty. / --${key} 不能为空。`;
  }
  if (
    flags.limit !== undefined &&
    (!Number.isInteger(flags.limit) || flags.limit < 1 || flags.limit > maxLimit)
  )
    return `--limit must be an integer from 1 to ${maxLimit}. / --limit 必须为 1–${maxLimit} 的整数。`;
  if (flags.depth !== undefined && (!Number.isInteger(flags.depth) || flags.depth < 0))
    return "--depth must be a non-negative integer. / --depth 必须为非负整数。";
  if (flags.content !== undefined && flags.contentFile !== undefined)
    return "--content and --content-file are mutually exclusive. / --content 与 --content-file 互斥。";
  if (
    flags.expectedContentSha256 !== undefined &&
    !/^[a-fA-F0-9]{64}$/.test(flags.expectedContentSha256)
  )
    return "--expected-content-sha256 requires 64 hexadecimal characters. / --expected-content-sha256 必须为 64 位十六进制字符串。";
  for (const value of [flags.createdAtGte, flags.createdAtLte]) {
    if (value !== undefined && (!value.trim() || !Number.isFinite(Date.parse(value))))
      return "Created-at filters must be valid timestamps. / created-at 筛选条件必须为有效时间戳。";
  }
  if (
    flags.createdAtGte &&
    flags.createdAtLte &&
    Date.parse(flags.createdAtGte) > Date.parse(flags.createdAtLte)
  )
    return "--created-at-gte must not be after --created-at-lte. / --created-at-gte 不能晚于 --created-at-lte。";
  return undefined;
}
async function readContent(flags: MemoryFlags): Promise<string | undefined> {
  return flags.contentFile !== undefined ? readFile(flags.contentFile, "utf8") : flags.content;
}
type ApiContext = ReturnType<typeof buildManagedApiContext>;
async function runOperation(
  host: ManagedApiHost,
  operation: string,
  request: Record<string, unknown>,
  invoke: (context: ApiContext) => Promise<unknown>,
): Promise<void> {
  const format = detectOutputFormat(host.settings.output);
  const result = host.settings.dryRun
    ? { operation, provider: "bailian", base_url: resolveManagedApiBaseUrl(host), ...request }
    : await withAgentErrors(() => withStdoutProtected(() => invoke(buildManagedApiContext(host))));
  if (format === "json") emitResult(result, format);
  else emitBare(JSON.stringify(result, null, 2));
}

export const managedAgentMemoryStoreList = defineCommand({
  description: { "en-US": "List Memory Stores", "zh-CN": "列出记忆库" },
  auth: "apiKey",
  flags: {
    ...WORKSPACE_FLAGS,
    ...PAGE_FLAGS,
    includeArchived: {
      type: "switch",
      description: { "en-US": "Include archived stores", "zh-CN": "包含已归档记忆库" },
    },
  },
  usageArgs: "[--workspace-id <id>] [--limit <n>] [--page <cursor>] [--include-archived]",
  exampleArgs: ["--workspace-id ws-example --output json"],
  notes: API_NOTES,
  validate: validateFlags,
  async run(ctx) {
    const options = {
      limit: ctx.flags.limit,
      page: ctx.flags.page,
      include_archived: ctx.flags.includeArchived,
    };
    await runOperation(ctx, "memory-store.list", { options }, (context) =>
      listMemoryStores(context.providers, "bailian", options),
    );
  },
});
export const managedAgentMemoryStoreGet = defineCommand({
  description: { "en-US": "Get a Memory Store", "zh-CN": "获取记忆库" },
  auth: "apiKey",
  flags: STORE_FLAGS,
  usageArgs: "--store-id <id> [--workspace-id <id>]",
  exampleArgs: ["--workspace-id ws-example --store-id memstore_example"],
  notes: API_NOTES,
  validate: validateFlags,
  async run(ctx) {
    await runOperation(ctx, "memory-store.get", { store_id: ctx.flags.storeId }, (context) =>
      getMemoryStore(context.providers, "bailian", ctx.flags.storeId),
    );
  },
});
export const managedAgentMemoryCreate = defineCommand({
  description: { "en-US": "Create a memory file", "zh-CN": "创建记忆文件" },
  auth: "apiKey",
  risk: WRITE_RISK,
  flags: { ...STORE_FLAGS, ...CONTENT_FLAGS, path: { ...PATH_FLAG.path, required: true } },
  usageArgs: "--store-id <id> --path <path> (--content <text> | --content-file <path>)",
  exampleArgs: ["--store-id memstore_example --path notes.md --content-file ./notes.md --dry-run"],
  notes: API_NOTES,
  validate: (flags) =>
    validateFlags(flags) ??
    (flags.content === undefined && flags.contentFile === undefined
      ? "Pass --content or --content-file. / 请提供 --content 或 --content-file。"
      : undefined),
  async run(ctx) {
    const request = { path: ctx.flags.path, content: (await readContent(ctx.flags))! };
    await runOperation(
      ctx,
      "memory-store.memories.create",
      { store_id: ctx.flags.storeId, request },
      (context) => createMemory(context.providers, "bailian", ctx.flags.storeId, request),
    );
  },
});
export const managedAgentMemoryList = defineCommand({
  description: { "en-US": "List memory files and prefixes", "zh-CN": "列出记忆文件和目录前缀" },
  auth: "apiKey",
  flags: {
    ...STORE_FLAGS,
    ...PAGE_FLAGS,
    limit: {
      ...PAGE_FLAGS.limit,
      description: { "en-US": "Page size (1–20)", "zh-CN": "单页数量（1–20）" },
    },
    ...VIEW_FLAGS,
    pathPrefix: {
      type: "string",
      valueHint: "<prefix>",
      description: { "en-US": "Filter by memory path prefix", "zh-CN": "按记忆路径前缀筛选" },
    },
    depth: {
      type: "number",
      valueHint: "<n>",
      description: { "en-US": "Directory listing depth", "zh-CN": "目录列举深度" },
    },
  },
  usageArgs:
    "--store-id <id> [--page <cursor>] [--limit <n>] [--path-prefix <prefix>] [--depth <n>] [--view <basic|full>]",
  exampleArgs: ["--store-id memstore_example --path-prefix /notes/ --view full"],
  notes: API_NOTES,
  validate: (flags) => validateFlags(flags, 20),
  async run(ctx) {
    const options = {
      limit: ctx.flags.limit,
      page: ctx.flags.page,
      path_prefix: ctx.flags.pathPrefix,
      depth: ctx.flags.depth,
      view: ctx.flags.view,
    };
    await runOperation(
      ctx,
      "memory-store.memories.list",
      { store_id: ctx.flags.storeId, options },
      (context) => listMemories(context.providers, "bailian", ctx.flags.storeId, options),
    );
  },
});
export const managedAgentMemoryGet = defineCommand({
  description: { "en-US": "Get a memory file", "zh-CN": "获取记忆文件" },
  auth: "apiKey",
  flags: MEMORY_FLAGS,
  usageArgs: "--store-id <id> --memory-id <id>",
  exampleArgs: ["--store-id memstore_example --memory-id mem_example"],
  notes: API_NOTES,
  validate: validateFlags,
  async run(ctx) {
    await runOperation(
      ctx,
      "memory-store.memories.get",
      { store_id: ctx.flags.storeId, memory_id: ctx.flags.memoryId },
      (context) => getMemory(context.providers, "bailian", ctx.flags.storeId, ctx.flags.memoryId),
    );
  },
});
export const managedAgentMemoryUpdate = defineCommand({
  description: {
    "en-US": "Update memory content with an optional SHA-256 precondition",
    "zh-CN": "更新记忆正文，可使用 SHA-256 并发前置条件",
  },
  auth: "apiKey",
  risk: WRITE_RISK,
  flags: { ...MEMORY_FLAGS, ...CONTENT_FLAGS, ...SHA_FLAGS },
  usageArgs:
    "--store-id <id> --memory-id <id> (--content <text> | --content-file <path>) [--expected-content-sha256 <sha256>]",
  exampleArgs: [
    "--store-id memstore_example --memory-id mem_example --content-file ./notes.md --dry-run",
  ],
  notes: API_NOTES,
  validate: (flags) =>
    validateFlags(flags) ??
    (flags.content === undefined && flags.contentFile === undefined
      ? "Pass --content or --content-file. / 请提供 --content 或 --content-file。"
      : undefined),
  async run(ctx) {
    const request = {
      content: await readContent(ctx.flags),
      ...(ctx.flags.expectedContentSha256 !== undefined
        ? { expected_content_sha256: ctx.flags.expectedContentSha256 }
        : {}),
    };
    await runOperation(
      ctx,
      "memory-store.memories.update",
      { store_id: ctx.flags.storeId, memory_id: ctx.flags.memoryId, request },
      (context) =>
        updateMemory(context.providers, "bailian", ctx.flags.storeId, ctx.flags.memoryId, request),
    );
  },
});
export const managedAgentMemoryDelete = defineCommand({
  description: { "en-US": "Delete a memory file", "zh-CN": "删除记忆文件" },
  auth: "apiKey",
  risk: WRITE_RISK,
  flags: MEMORY_FLAGS,
  usageArgs: "--store-id <id> --memory-id <id>",
  exampleArgs: ["--store-id memstore_example --memory-id mem_example --dry-run"],
  notes: API_NOTES,
  validate: validateFlags,
  async run(ctx) {
    await runOperation(
      ctx,
      "memory-store.memories.delete",
      { store_id: ctx.flags.storeId, memory_id: ctx.flags.memoryId },
      (context) =>
        deleteMemory(context.providers, "bailian", ctx.flags.storeId, ctx.flags.memoryId),
    );
  },
});
export const managedAgentMemoryVersionList = defineCommand({
  description: { "en-US": "List Memory Store versions", "zh-CN": "列出记忆库版本" },
  auth: "apiKey",
  flags: {
    ...STORE_FLAGS,
    ...PAGE_FLAGS,
    ...VIEW_FLAGS,
    memoryId: { ...MEMORY_FLAGS.memoryId, required: false },
    operation: {
      type: "string",
      valueHint: "<created|modified|deleted>",
      choices: ["created", "modified", "deleted"] as const,
      description: { "en-US": "Filter by version operation", "zh-CN": "按版本操作筛选" },
    },
    createdAtGte: {
      type: "string",
      valueHint: "<timestamp>",
      description: {
        "en-US": "Inclusive creation timestamp lower bound",
        "zh-CN": "创建时间下限（含）",
      },
    },
    createdAtLte: {
      type: "string",
      valueHint: "<timestamp>",
      description: {
        "en-US": "Inclusive creation timestamp upper bound",
        "zh-CN": "创建时间上限（含）",
      },
    },
  },
  usageArgs:
    "--store-id <id> [--memory-id <id>] [--operation <created|modified|deleted>] [--created-at-gte <timestamp>] [--created-at-lte <timestamp>] [--page <cursor>] [--limit <n>] [--view <basic|full>]",
  exampleArgs: ["--store-id memstore_example --operation modified --view full"],
  notes: API_NOTES,
  validate: validateFlags,
  async run(ctx) {
    const options = {
      limit: ctx.flags.limit,
      page: ctx.flags.page,
      view: ctx.flags.view,
      memory_id: ctx.flags.memoryId,
      operation: ctx.flags.operation,
      "created_at.gte": ctx.flags.createdAtGte,
      "created_at.lte": ctx.flags.createdAtLte,
    };
    await runOperation(
      ctx,
      "memory-store.versions.list",
      { store_id: ctx.flags.storeId, options },
      (context) => listMemoryVersions(context.providers, "bailian", ctx.flags.storeId, options),
    );
  },
});
export const managedAgentMemoryVersionGet = defineCommand({
  description: { "en-US": "Get a memory version", "zh-CN": "获取记忆版本" },
  auth: "apiKey",
  flags: VERSION_FLAGS,
  usageArgs: "--store-id <id> --version-id <id>",
  exampleArgs: ["--store-id memstore_example --version-id memver_example"],
  notes: API_NOTES,
  validate: validateFlags,
  async run(ctx) {
    await runOperation(
      ctx,
      "memory-store.versions.get",
      { store_id: ctx.flags.storeId, version_id: ctx.flags.versionId },
      (context) =>
        getMemoryVersion(context.providers, "bailian", ctx.flags.storeId, ctx.flags.versionId),
    );
  },
});
export const managedAgentMemoryVersionRedact = defineCommand({
  description: {
    "en-US": "Permanently redact a memory version's content",
    "zh-CN": "永久擦除记忆版本正文",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently redacts the selected version's content and cannot be undone.",
      "zh-CN": "该操作将永久擦除指定版本正文，无法撤销。",
    },
  },
  flags: VERSION_FLAGS,
  usageArgs: "--store-id <id> --version-id <id>",
  exampleArgs: ["--store-id memstore_example --version-id memver_example --dry-run"],
  notes: API_NOTES,
  validate: validateFlags,
  async run(ctx) {
    await runOperation(
      ctx,
      "memory-store.versions.redact",
      { store_id: ctx.flags.storeId, version_id: ctx.flags.versionId },
      (context) =>
        redactMemoryVersion(context.providers, "bailian", ctx.flags.storeId, ctx.flags.versionId),
    );
  },
});
