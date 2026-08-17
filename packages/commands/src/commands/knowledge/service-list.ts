import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagAgentListResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, truncateLine, PAGE_FLAGS, WORKSPACE_FLAG } from "./shared.ts";

const SERVICE_LIST_FLAGS = {
  scene: {
    type: "string",
    valueHint: "<scene>",
    description: "Service scene: chat (Q&A) or search (retrieval). Required by the server",
    required: true,
  },
  status: {
    type: "string",
    valueHint: "<status>",
    description: "Filter by status: draft, deployed (includes edited) or deleted",
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: "Filter by service name (fuzzy match)",
  },
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: "Filter by exact agent ID",
  },
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Filter by exact linked knowledge base (pipeline) ID",
  },
  ...PAGE_FLAGS,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

const SCENES = ["chat", "search"];
const STATUSES = ["draft", "deployed", "deleted"];

export default defineCommand({
  description: "List retrieval / Q&A services (agents) in the workspace",
  auth: "apiKey",
  usageArgs: "--scene <chat|search> [flags]",
  flags: SERVICE_LIST_FLAGS,
  notes: [
    "A scene (chat or search) is required — run once per scene to see both.",
    "Use the returned agent_id with the search or chat commands, or with service management commands.",
  ],
  exampleArgs: ["--scene chat --workspace-id ws-xxx", "--scene search --status deployed"],
  validate(flags) {
    if (!SCENES.includes(flags.scene)) return "--scene must be chat or search";
    if (flags.status !== undefined && !STATUSES.includes(flags.status)) {
      return "--status must be draft, deployed or deleted";
    }
    if (flags.pageSize !== undefined && (flags.pageSize < 1 || flags.pageSize > 100)) {
      return "--page-size must be between 1 and 100";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // agent/list pagination goes in the body
    const body = {
      agent_scene: flags.scene,
      ...(flags.status ? { agent_status: flags.status } : {}),
      ...(flags.name ? { agent_name: flags.name } : {}),
      ...(flags.agentId ? { agent_id: flags.agentId } : {}),
      ...(flags.indexId ? { pipeline_id: flags.indexId } : {}),
      page_number: flags.pageNumber ?? 1,
      page_size: flags.pageSize ?? 10,
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentList);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagAgentListResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const rows = response.data?.rows ?? [];
    if (settings.quiet) {
      for (const row of rows) emitBare(row.agent_id ?? "");
      return;
    }
    if (format === "text") {
      if (rows.length === 0) {
        emitBare("No services found.");
      } else {
        for (const row of rows) {
          const kbNames = (row.pipeline_list ?? [])
            .map((pipeline) => pipeline.pipeline_name)
            .filter(Boolean)
            .join(",");
          emitBare(
            truncateLine(
              [
                row.agent_id,
                row.agent_status,
                row.agent_version,
                row.agent_name,
                kbNames ? `(kb: ${kbNames})` : "",
              ]
                .filter(Boolean)
                .join("  "),
            ),
          );
        }
      }
      emitBare(`total: ${response.data?.total_count ?? rows.length}`);
      // Connect finding an ID with using it (capability wording, no hardcoded product path)
      emitBare(
        flags.scene === "search"
          ? "Use an agent_id above with the knowledge search command."
          : "Use an agent_id above with the knowledge chat command.",
      );
    } else {
      emitResult(response, format);
    }
  },
});
