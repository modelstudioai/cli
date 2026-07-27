import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { listSessionEvents } from "@openagentpack/sdk";
import { sanitizeSessionEvents } from "@openagentpack/sdk/session-events";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { fetchAllPages } from "./_engine/pagination.ts";

const SESSION_EVENTS_FLAGS = {
  sessionId: {
    type: "string",
    valueHint: "<id>",
    description: "Session ID (required)",
    required: true,
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: "Target provider",
  },
  limit: {
    type: "number",
    valueHint: "<n>",
    description: "Maximum number of events to fetch",
  },
  all: {
    type: "switch",
    description: "Fetch all pages by following the cursor",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "List event history for a session",
  auth: "apiKey",
  usageArgs: "--session-id <id> [--limit <n>] [--all] [--file <path>]",
  flags: SESSION_EVENTS_FLAGS,
  exampleArgs: ["--session-id sess_abc123", "--session-id sess_abc123 --all"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const { items: events, hasMore } = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        return fetchAllPages(async (page) => {
          const result = await listSessionEvents(runtime, flags.sessionId, {
            provider: flags.provider,
            limit: flags.limit,
            page_token: page,
          });
          return {
            items: result.events,
            hasMore: result.has_more,
            nextPage: result.next_page,
          };
        }, flags.all);
      }),
    );

    if (format === "json") {
      emitResult({ events: sanitizeSessionEvents(events), has_more: hasMore }, format);
      return;
    }
    if (events.length === 0) {
      emitBare("No events found.");
      return;
    }

    const headers = ["#", "TYPE", "CONTENT"];
    const rows = events.map((event, index) => {
      let preview = "";
      if (event.type === "message") preview = (event.content ?? "").slice(0, 60);
      else if (event.type === "tool_use") preview = event.tool_name ?? "";
      else if (event.type === "tool_result") preview = (event.content ?? "").slice(0, 60);
      else if (event.type === "status") preview = event.status ?? "";
      else if (event.type === "error") preview = (event.content ?? "").slice(0, 60);
      else preview = event.raw_type;
      return [String(index + 1), event.type, preview];
    });
    for (const line of formatTable(headers, rows)) emitBare(line);
    emitBare(`\nTotal: ${events.length}`);
    if (hasMore) emitBare("More events available. Use --all to fetch all.");
  },
});
