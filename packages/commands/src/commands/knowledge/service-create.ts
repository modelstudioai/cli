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

const SERVICE_CREATE_FLAGS = {
  name: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Service name (up to 200 chars, unique per scene in the workspace)",
      "zh-CN": "服务名称（最多 200 个字符，在 Workspace 的同一场景中唯一）",
    },
    required: true,
  },
  scene: {
    type: "string",
    valueHint: "<scene>",
    description: {
      "en-US": "Service scene: chat (Q&A) or search (retrieval)",
      "zh-CN": "服务场景：chat（问答）或 search（检索）",
    },
    required: true,
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US":
        "What this service answers and who it serves — recommended: agents read it to pick the right service (up to 1000 chars)",
      "zh-CN":
        "这个服务能回答什么、给谁用 —— 建议填写：agent 靠它判断该调用哪个服务（最多 1000 个字符）",
    },
  },
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Bind this knowledge base; other settings use server defaults",
      "zh-CN": "绑定该知识库；其他设置使用服务端默认值",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Create a retrieval / Q&A service (initial status: draft, version: beta)",
    "zh-CN": "创建检索/问答服务（初始状态：draft，版本：beta）",
  },
  auth: "apiKey",
  usageArgs: "--name <text> --scene <chat|search> [flags]",
  flags: SERVICE_CREATE_FLAGS,
  notes: [
    {
      "en-US": "Without an explicit configuration the server applies its default agent settings.",
      "zh-CN": "未显式提供配置时，服务端会应用默认 Agent 设置。",
    },
    {
      "en-US":
        "The draft (beta) version can be tested via --agent-version beta on search/chat before deploying.",
      "zh-CN": "部署前，可在 search/chat 命令中使用 --agent-version beta 测试草稿（beta）版本。",
    },
    {
      "en-US": "Requires the knowledge-base create permission in the workspace.",
      "zh-CN": "需要 Workspace 中的知识库创建权限。",
    },
  ],
  exampleArgs: [
    {
      "en-US":
        "--name my-qa --scene chat --description 'answers product FAQs' --workspace-id ws-xxx",
      "zh-CN": "--name my-qa --scene chat --description '回答产品常见问题' --workspace-id ws-xxx",
    },
    "--name my-search --scene search --index-id idx-xxx",
  ],
  validate(flags) {
    if (flags.name.length > 200) return "--name must be at most 200 characters";
    if (flags.scene !== "chat" && flags.scene !== "search") {
      return "--scene must be chat or search";
    }
    if (flags.description !== undefined && flags.description.length > 1000) {
      return "--description must be at most 1000 characters";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // agent_config is optional — omit to use server defaults; with --index-id build
    // the minimal kb_search_configs (name/desc etc. are backfilled by the system from
    // the knowledge base, so they are not sent)
    const body = {
      agent_name: flags.name,
      agent_scene: flags.scene,
      ...(flags.description ? { agent_desc: flags.description } : {}),
      ...(flags.indexId ? { agent_config: { kb_search_configs: [{ id: flags.indexId }] } } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentCreate);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagAgentMutationResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const agentId = agentMutationField(response, "agent_id");
    if (settings.quiet) {
      emitBare(agentId ?? "");
      return;
    }
    if (format === "text") {
      emitBare(
        `created: ${agentId ?? "-"}  (status: ${agentMutationField(response, "agent_status") ?? "draft"}, version: ${agentMutationField(response, "agent_version") ?? "beta"})`,
      );
      emitBare(
        "Test the draft with --agent-version beta on search/chat, then deploy it to publish.",
      );
      return;
    }
    emitResult(response, format);
  },
});
