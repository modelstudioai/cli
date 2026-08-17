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
    description: "Service (agent) ID",
    required: true,
  },
  agentVersion: {
    type: "string",
    valueHint: "<version>",
    description: "Specific version to inspect (beta or a published number); omit for all versions",
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
  description: "Show service (agent) details including per-version configuration",
  auth: "apiKey",
  usageArgs: "--agent-id <id> [flags]",
  flags: SERVICE_GET_FLAGS,
  notes: [
    "Without --agent-version all versions are returned (beta draft plus published numbers).",
    "The version value is passed through as-is; the valid set is server-side state.",
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
