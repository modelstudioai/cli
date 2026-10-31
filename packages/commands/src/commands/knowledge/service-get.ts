import { validateNonemptyFlags } from "./nonempty-flags.ts";
import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  type FlagsDef,
  type RagAgentDetail,
  type LocalizedText,
  type RagAgentGetResponse,
} from "bailian-cli-core";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const SERVICE_GET_FLAGS = {
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Service (agent) ID", "zh-CN": "服务（Agent）ID" },
    required: true,
  },
  agentVersion: {
    type: "string",
    valueHint: "<version>",
    description: {
      "en-US": "Specific version to inspect (beta or a published number); omit for all versions",
      "zh-CN": "要查看的指定版本（beta 或已发布版本号）；省略则返回全部版本",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

function detailLines(detail: RagAgentDetail, localize: (text: LocalizedText) => string): string[] {
  const lines = [
    localize({
      "en-US": `Version ${detail.agent_version ?? "?"}:`,
      "zh-CN": `版本 ${detail.agent_version ?? "?"}:`,
    }),
  ];
  if (detail.agent_version_desc)
    lines.push(
      localize({
        "en-US": `  desc: ${detail.agent_version_desc}`,
        "zh-CN": `  描述: ${detail.agent_version_desc}`,
      }),
    );
  if (detail.publish_time !== undefined)
    lines.push(
      localize({
        "en-US": `  published: ${detail.publish_time}`,
        "zh-CN": `  发布时间: ${detail.publish_time}`,
      }),
    );
  const config = detail.agent_config;
  if (!config) return lines;
  if (config.agent_policy)
    lines.push(
      localize({
        "en-US": `  policy: ${config.agent_policy}`,
        "zh-CN": `  策略: ${config.agent_policy}`,
      }),
    );
  if (config.agent_model)
    lines.push(
      localize({
        "en-US": `  model: ${config.agent_model}`,
        "zh-CN": `  模型: ${config.agent_model}`,
      }),
    );
  if (config.hybrid_rerank !== undefined)
    lines.push(`  hybrid_rerank: ${JSON.stringify(config.hybrid_rerank)}`);
  if (config.temperature !== undefined)
    lines.push(
      localize({
        "en-US": `  temperature: ${config.temperature}`,
        "zh-CN": `  温度: ${config.temperature}`,
      }),
    );
  for (const kbConfig of config.kb_search_configs ?? []) {
    const kbId = typeof kbConfig.id === "string" ? kbConfig.id : "?";
    const kbName = typeof kbConfig.name === "string" ? `  (${kbConfig.name})` : "";
    lines.push(
      localize({ "en-US": `  kb: ${kbId}${kbName}`, "zh-CN": `  知识库: ${kbId}${kbName}` }),
    );
    for (const key of [
      "rerank",
      "rerank_model",
      "rerank_top_n",
      "rerank_min_score",
      "dense_similarity_top_k",
      "sparse_similarity_top_k",
    ]) {
      if (kbConfig[key] !== undefined) lines.push(`    ${key}: ${JSON.stringify(kbConfig[key])}`);
    }
  }
  return lines;
}

export default defineCommand({
  description: {
    "en-US": "Show service (agent) details including per-version configuration",
    "zh-CN": "查看服务（Agent）详情及各版本配置",
  },
  auth: "apiKey",
  usageArgs: "--agent-id <id> [flags]",
  flags: SERVICE_GET_FLAGS,
  notes: [
    {
      "en-US":
        "Without --agent-version all versions are returned (beta draft plus published numbers).",
      "zh-CN": "未传入 --agent-version 时，会返回所有版本（beta 草稿和已发布版本号）。",
    },
    {
      "en-US": "The version value is passed through as-is; the valid set is server-side state.",
      "zh-CN": "版本值将原样传递；有效版本集合由服务端状态决定。",
    },
  ],
  exampleArgs: [
    "--agent-id aid-xxx --workspace-id ws-xxx",
    "--agent-id aid-xxx --agent-version beta",
  ],
  validate(flags) {
    const nonemptyError = validateNonemptyFlags({ "agent-id": flags.agentId });
    if (nonemptyError) return nonemptyError;
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = settings.output;

    const body = {
      agent_id: flags.agentId,
      ...(flags.agentVersion ? { agent_version: flags.agentVersion } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentGet);

    if (settings.dryRun) {
      ctx.output.result({ endpoint, request: body });
      return;
    }

    const response = await ctx.client.requestJson<RagAgentGetResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    let text: string | undefined;
    if (format === "text") {
      const data = response.data;
      const lines = [
        ctx.localize({ "en-US": "Basic:", "zh-CN": "基本信息:" }),
        `  id: ${data?.agent_id ?? "-"}`,
        ctx.localize({
          "en-US": `  name: ${data?.agent_name ?? "-"}`,
          "zh-CN": `  名称: ${data?.agent_name ?? "-"}`,
        }),
        ctx.localize({
          "en-US": `  desc: ${data?.agent_desc ?? "-"}`,
          "zh-CN": `  描述: ${data?.agent_desc ?? "-"}`,
        }),
        ctx.localize({
          "en-US": `  scene: ${data?.agent_scene ?? "-"}`,
          "zh-CN": `  场景: ${data?.agent_scene ?? "-"}`,
        }),
        ctx.localize({
          "en-US": `  status: ${data?.agent_status ?? "-"}`,
          "zh-CN": `  状态: ${data?.agent_status ?? "-"}`,
        }),
      ];
      for (const detail of data?.agent_details ?? [])
        lines.push(...detailLines(detail, ctx.localize));
      text = lines.join("\n");
    }
    ctx.output.result(response, text === undefined ? undefined : { text });
  },
});
