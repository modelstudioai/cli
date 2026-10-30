import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  type FlagsDef,
  type RagAgentMutationResponse,
} from "bailian-cli-core";
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
    const format = settings.output;

    const body = { agent_id: flags.agentId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentCopy);

    if (settings.dryRun) {
      ctx.output.result({ endpoint, request: body });
      return;
    }

    const response = await ctx.client.requestJson<RagAgentMutationResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    ctx.output.result(
      response,
      format === "text"
        ? {
            text: [
              ctx.localize({
                "en-US": `new agent_id: ${agentMutationField(response, "agent_id") ?? "-"}  (name: ${agentMutationField(response, "agent_name") ?? "-"}, status: ${agentMutationField(response, "agent_status") ?? "draft"})`,
                "zh-CN": `新 agent_id: ${agentMutationField(response, "agent_id") ?? "-"}  (名称: ${agentMutationField(response, "agent_name") ?? "-"}, 状态: ${agentMutationField(response, "agent_status") ?? "draft"})`,
              }),
              ctx.localize({
                "en-US":
                  "Test the draft with --agent-version beta on search/chat, then deploy it to publish.",
                "zh-CN": "在 search/chat 中使用 --agent-version beta 测试草稿，然后部署发布。",
              }),
            ].join("\n"),
          }
        : undefined,
    );
  },
});
