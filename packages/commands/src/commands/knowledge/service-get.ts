import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagAgentDetail,
  type RagAgentGetResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
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

function printDetail(detail: RagAgentDetail): void {
  emitBare(`Version ${detail.agent_version ?? "?"}:`);
  if (detail.agent_version_desc) emitBare(`  desc: ${detail.agent_version_desc}`);
  if (detail.publish_time !== undefined) emitBare(`  published: ${detail.publish_time}`);
  const config = detail.agent_config;
  if (!config) return;
  if (config.agent_policy) emitBare(`  policy: ${config.agent_policy}`);
  if (config.agent_model) emitBare(`  model: ${config.agent_model}`);
  if (config.temperature !== undefined) emitBare(`  temperature: ${config.temperature}`);
  for (const kbConfig of config.kb_search_configs ?? []) {
    const kbId = typeof kbConfig.id === "string" ? kbConfig.id : "?";
    const kbName = typeof kbConfig.name === "string" ? `  (${kbConfig.name})` : "";
    emitBare(`  kb: ${kbId}${kbName}`);
  }
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
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const body = {
      agent_id: flags.agentId,
      ...(flags.agentVersion ? { agent_version: flags.agentVersion } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentGet);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagAgentGetResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const data = response.data;
    if (settings.quiet) {
      emitBare(data?.agent_id ?? "");
      return;
    }
    if (format !== "text") {
      emitResult(response, format);
      return;
    }
    emitBare("Basic:");
    emitBare(`  id: ${data?.agent_id ?? "-"}`);
    emitBare(`  name: ${data?.agent_name ?? "-"}`);
    emitBare(`  desc: ${data?.agent_desc ?? "-"}`);
    emitBare(`  scene: ${data?.agent_scene ?? "-"}`);
    emitBare(`  status: ${data?.agent_status ?? "-"}`);
    for (const detail of data?.agent_details ?? []) {
      printDetail(detail);
    }
  },
});
