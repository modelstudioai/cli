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
  yes: {
    type: "switch",
    description: { "en-US": "Skip the confirmation prompt", "zh-CN": "跳过确认提示" },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** Confirmation summary lookup (name/status); warns that deploying an edited draft overwrites live behavior; failure degrades to id-only */
async function buildDeploySummary(
  client: Client,
  workspaceId: string,
  agentId: string,
): Promise<string> {
  let infoPart = "";
  let editedWarning = "";
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
      if (status === "edited") {
        editedWarning =
          "\nWARNING: a published version is live — deploying replaces its behavior with the current draft.";
      }
    }
  } catch {
    // Degrade gracefully: a failed lookup does not block confirmation
  }
  return `Deploy service ${agentId}${infoPart}${editedWarning}\nPublishing changes what live callers get from this service.`;
}

export default defineCommand({
  description: {
    "en-US": "Publish the beta draft of a service as a new version",
    "zh-CN": "将服务的 beta 草稿发布为新版本",
  },
  auth: "apiKey",
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
    const format = detectOutputFormat(settings.output);

    const body = {
      agent_id: flags.agentId,
      ...(flags.versionDesc ? { agent_version_desc: flags.versionDesc } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentDeploy);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const summary = flags.yes
      ? ""
      : await buildDeploySummary(ctx.client, workspaceId, flags.agentId);
    await confirmDangerousAction(summary, flags.yes ?? false);

    const response = await ctx.client.requestJson<RagAgentMutationResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const newVersion = agentMutationField(response, "agent_version");
    if (settings.quiet) {
      emitBare(newVersion ?? "");
      return;
    }
    if (format === "text") {
      emitBare(`deployed: ${flags.agentId}  version ${newVersion ?? "-"}`);
      return;
    }
    emitResult(response, format);
  },
});
