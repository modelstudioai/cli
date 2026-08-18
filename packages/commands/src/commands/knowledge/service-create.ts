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
    description: "Service name (up to 200 chars, unique per scene in the workspace)",
    required: true,
  },
  scene: {
    type: "string",
    valueHint: "<scene>",
    description: "Service scene: chat (Q&A) or search (retrieval)",
    required: true,
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: "Service description (up to 1000 chars)",
  },
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Bind this knowledge base; other settings use server defaults",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "Create a retrieval / Q&A service (initial status: draft, version: beta)",
  auth: "apiKey",
  usageArgs: "--name <text> --scene <chat|search> [flags]",
  flags: SERVICE_CREATE_FLAGS,
  notes: [
    "Without an explicit configuration the server applies its default agent settings.",
    "The draft (beta) version can be tested via --agent-version beta on search/chat before deploying.",
    "Requires the knowledge-base create permission in the workspace.",
  ],
  exampleArgs: [
    "--name my-qa --scene chat --workspace-id ws-xxx",
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
