import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type Client,
  type FlagsDef,
  type RagAgentGetResponse,
  type RagAgentMutationResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, confirmDangerousAction } from "bailian-cli-runtime";
import { agentMutationField, resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const SERVICE_DELETE_FLAGS = {
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Service (agent) ID", "zh-CN": "服务（Agent）ID" },
    required: true,
  },
  yes: {
    type: "switch",
    description: { "en-US": "Skip the confirmation prompt", "zh-CN": "跳过确认提示" },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** Confirmation summary lookup (name/status); failure degrades to id-only */
async function buildDeleteSummary(
  client: Client,
  workspaceId: string,
  agentId: string,
): Promise<string> {
  let infoPart = "";
  let liveWarning = "";
  try {
    const detail = await client.requestJson<RagAgentGetResponse>({
      path: ragEndpoint(workspaceId, RAG_PATHS.agentGet),
      method: "POST",
      body: { agent_id: agentId },
    });
    const name = detail.data?.agent_name;
    const status = detail.data?.agent_status;
    if (name) infoPart += `  name: ${name}`;
    if (status) {
      infoPart += `  status: ${status}`;
      if (status === "deployed" || status === "edited") {
        liveWarning = "\nWARNING: this service is LIVE — deleting it breaks existing callers.";
      }
    }
  } catch {
    // Degrade gracefully: a failed lookup does not block confirmation
  }
  return `Delete service ${agentId}${infoPart}${liveWarning}\nDeletion cannot be undone; the agent_id can no longer be used for search or chat calls.`;
}

export default defineCommand({
  description: {
    "en-US": "Delete a retrieval / Q&A service (soft delete, idempotent)",
    "zh-CN": "删除检索/问答服务（软删除，幂等）",
  },
  auth: "apiKey",
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

    const summary = flags.yes
      ? ""
      : await buildDeleteSummary(ctx.client, workspaceId, flags.agentId);
    await confirmDangerousAction(summary, flags.yes ?? false);

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
