import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { listSessionSummaries } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { fetchAllPages } from "./_engine/pagination.ts";

const SESSION_LIST_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
  agent: {
    type: "string",
    valueHint: "<name>",
    description: "Filter by agent name",
  },
  all: {
    type: "switch",
    description: "Fetch all pages by following the cursor",
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: "Target provider",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "List sessions from the provider",
  auth: "apiKey",
  // Provider-aware gate: only the session's provider needs credentials.
  authOptional: true,
  usageArgs: "[--agent <name>] [--all] [--provider <name>] [--file <path>]",
  flags: SESSION_LIST_FLAGS,
  exampleArgs: ["", "--agent assistant", "--all"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const { items: summaries, hasMore } = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: flags.provider ?? "targets",
        });
        return fetchAllPages(async (page) => {
          const result = await listSessionSummaries(runtime, {
            agent: flags.agent,
            provider: flags.provider,
            filter: page ? { page } : undefined,
          });
          return {
            items: result.summaries,
            hasMore: result.hasMore,
            nextPage: result.nextPage,
          };
        }, flags.all);
      }),
    );

    const sessions = summaries.map((summary) => summary.session);
    if (format === "json") {
      emitResult({ sessions, has_more: hasMore }, format);
      return;
    }
    if (sessions.length === 0) {
      emitBare("No sessions found.");
      return;
    }

    const agentNames = new Map(
      summaries
        .filter((summary) => summary.agentName)
        .map((summary) => [summary.session.id, summary.agentName!]),
    );
    const headers = ["ID", "TITLE", "AGENT", "STATUS", "CREATED"];
    const rows = sessions.map((session) => [
      session.id,
      (session.title ?? "").slice(0, 20),
      agentNames.get(session.id) ?? session.agent_id.slice(0, 12),
      session.status,
      session.created_at,
    ]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    emitBare(`\nTotal: ${sessions.length}`);
    if (hasMore) emitBare("More sessions available. Use --all to fetch all.");
  },
});
