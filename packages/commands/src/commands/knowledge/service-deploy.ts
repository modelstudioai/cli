import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  type FlagsDef,
  type RagAgentMutationResponse,
} from "bailian-cli-core";
import { agentMutationField, resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const SERVICE_DEPLOY_FLAGS = {
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Service (agent) ID", "zh-CN": "服务（Agent）ID" },
    required: true,
  },
  versionDesc: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Description for the newly published version",
      "zh-CN": "新发布版本的描述",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Publish the beta draft of a service as a new version",
    "zh-CN": "将服务的 beta 草稿发布为新版本",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This publishes the current draft as a new version and changes the behavior seen by live callers.",
      "zh-CN": "该操作会将当前草稿发布为新版本，并改变线上调用方使用的服务行为。",
    },
  },
  usageArgs: "--agent-id <id> [flags]",
  flags: SERVICE_DEPLOY_FLAGS,
  notes: [
    {
      "en-US": "The version number auto-increments; status becomes deployed.",
      "zh-CN": "版本号会自动递增；状态将变为 deployed。",
    },
    {
      "en-US":
        "Publishing affects live callers — the confirmation prompt guards against accidents.",
      "zh-CN": "发布会影响线上调用方——确认提示用于避免误操作。",
    },
    {
      "en-US": "Requires the knowledge-base modify permission in the workspace.",
      "zh-CN": "需要 Workspace 中的知识库修改权限。",
    },
  ],
  exampleArgs: [
    "--agent-id aid-xxx --workspace-id ws-xxx",
    {
      "en-US": "--agent-id aid-xxx --version-desc 'tuned rerank params' --yes",
      "zh-CN": "--agent-id aid-xxx --version-desc '已调优 Rerank 参数' --yes",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = settings.output;

    const body = {
      agent_id: flags.agentId,
      ...(flags.versionDesc ? { agent_version_desc: flags.versionDesc } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentDeploy);

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
            text: ctx.localize({
              "en-US": `deployed: ${flags.agentId}  version ${agentMutationField(response, "agent_version") ?? "-"}`,
              "zh-CN": `已部署: ${flags.agentId}  版本 ${agentMutationField(response, "agent_version") ?? "-"}`,
            }),
          }
        : undefined,
    );
  },
});
