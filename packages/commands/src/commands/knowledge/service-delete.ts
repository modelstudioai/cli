import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagAgentMutationResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { agentMutationField, resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const SERVICE_DELETE_FLAGS = {
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Service (agent) ID", "zh-CN": "服务（Agent）ID" },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Delete a retrieval / Q&A service (soft delete, idempotent)",
    "zh-CN": "删除检索/问答服务（软删除，幂等）",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This deletes the service and makes its agent ID unavailable for search and chat calls. The operation cannot be undone.",
      "zh-CN": "该操作会删除服务，使其 Agent ID 无法再用于搜索和对话调用，且无法撤销。",
    },
  },
  usageArgs: "--agent-id <id> [flags]",
  flags: SERVICE_DELETE_FLAGS,
  notes: [
    {
      "en-US":
        "Deletion cannot be undone; the agent_id becomes unusable for search and chat calls.",
      "zh-CN": "删除无法撤销；该 agent_id 将不能再用于 search 和 chat 调用。",
    },
    {
      "en-US": "Idempotent — deleting an already-deleted service does not fail.",
      "zh-CN": "该操作具有幂等性——重复删除已删除的服务不会失败。",
    },
    {
      "en-US": "Requires the knowledge-base delete permission in the workspace.",
      "zh-CN": "需要 Workspace 中的知识库删除权限。",
    },
  ],
  exampleArgs: ["--agent-id aid-xxx --workspace-id ws-xxx", "--agent-id aid-xxx --yes"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const body = { agent_id: flags.agentId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentDelete);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagAgentMutationResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    if (settings.quiet) return;
    if (format === "text") {
      emitBare(
        `deleted: ${flags.agentId}  (status: ${agentMutationField(response, "agent_status") ?? "deleted"})`,
      );
      return;
    }
    emitResult(response, format);
  },
});
