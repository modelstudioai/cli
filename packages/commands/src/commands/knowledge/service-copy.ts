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

const SERVICE_COPY_FLAGS = {
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Source service (agent) ID to copy",
      "zh-CN": "要复制的源服务（Agent）ID",
    },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Copy a service into a new draft (name gets a copy_ prefix)",
    "zh-CN": "将服务复制为新草稿（名称会添加 copy_ 前缀）",
  },
  auth: "apiKey",
  usageArgs: "--agent-id <id> [flags]",
  flags: SERVICE_COPY_FLAGS,
  notes: [
    {
      "en-US":
        "The copy starts as a beta draft; test it with --agent-version beta, then deploy to publish.",
      "zh-CN": "副本初始为 beta 草稿；请使用 --agent-version beta 测试，然后部署发布。",
    },
    {
      "en-US": "Requires the knowledge-base create permission in the workspace.",
      "zh-CN": "需要 Workspace 中的知识库创建权限。",
    },
  ],
  exampleArgs: ["--agent-id aid-xxx --workspace-id ws-xxx"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const body = { agent_id: flags.agentId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentCopy);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagAgentMutationResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const newAgentId = agentMutationField(response, "agent_id");
    if (settings.quiet) {
      emitBare(newAgentId ?? "");
      return;
    }
    if (format === "text") {
      emitBare(
        `new agent_id: ${newAgentId ?? "-"}  (name: ${agentMutationField(response, "agent_name") ?? "-"}, status: ${agentMutationField(response, "agent_status") ?? "draft"})`,
      );
      emitBare(
        "Test the draft with --agent-version beta on search/chat, then deploy it to publish.",
      );
      return;
    }
    emitResult(response, format);
  },
});
