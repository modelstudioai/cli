import {
  defineCommand,
  memoryEndpoint,
  memoryListPath,
  detectOutputFormat,
  type FlagsDef,
  type MemoryNodeListResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { buildQuery } from "../shared/params.ts";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_WORKSPACE_NOTE,
  PROJECT_ID_FLAG,
  WORKSPACE_FLAG,
  checkMemoryScopeLengths,
  resolveWorkspaceId,
} from "./shared.ts";

const LIST_FLAGS = {
  userId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Memory entity ID that owns the memory (required)",
      "zh-CN": "记忆实体 ID，标识记忆归属对象（必填）",
    },
    required: true,
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Results per page (default: 10)", "zh-CN": "每页结果数（默认：10）" },
  },
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  ...PROJECT_ID_FLAG,
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "List memory nodes for a user", "zh-CN": "列出用户的记忆节点" },
  auth: "apiKey",
  usageArgs: "--user-id <id> [flags]",
  flags: LIST_FLAGS,
  notes: [MEMORY_WORKSPACE_NOTE],
  exampleArgs: [
    "--user-id user1 --workspace-id ws_xxx",
    "--user-id user1 --page-size 20 --page 2",
    "--user-id user1 --memory-library-id lib_xxx --output json",
  ],
  validate: (flags) => {
    const scopeError = checkMemoryScopeLengths(flags);
    if (scopeError) return scopeError;
    if (flags.page !== undefined && flags.page < 1) return "--page must be at least 1.";
    if (flags.pageSize !== undefined && flags.pageSize < 1)
      return "--page-size must be at least 1.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    const format = detectOutputFormat(settings.output);
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), memoryListPath()) +
      buildQuery({
        user_id: flags.userId,
        page_size: flags.pageSize,
        page_num: flags.page,
        project_id: flags.projectId,
        memory_library_id: flags.memoryLibraryId,
      });

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemoryNodeListResponse>({
      path: url,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
      if (!response.memory_nodes || response.memory_nodes.length === 0) {
        emitBare("No memory nodes found.");
      } else {
        for (const node of response.memory_nodes) {
          emitBare(`[${node.memory_node_id}] ${node.content}`);
          if (node.meta_data && Object.keys(node.meta_data).length > 0) {
            emitBare(`  meta: ${JSON.stringify(node.meta_data)}`);
          }
        }
        if (response.total !== undefined) {
          emitBare(`\nTotal: ${response.total}`);
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
