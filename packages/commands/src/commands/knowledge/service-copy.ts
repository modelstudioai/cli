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
    description: "Source service (agent) ID to copy",
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "Copy a service into a new draft (name gets a copy_ prefix)",
  auth: "apiKey",
  usageArgs: "--agent-id <id> [flags]",
  flags: SERVICE_COPY_FLAGS,
  notes: [
    "The copy starts as a beta draft; test it with --agent-version beta, then deploy to publish.",
    "Requires the knowledge-base create permission in the workspace.",
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
