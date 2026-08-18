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
    description: { "en-US": "Session ID (required)", "zh-CN": "Session ID（必填）" },
    required: true,
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Target provider", "zh-CN": "目标 Provider" },
  },
  limit: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Maximum number of events to fetch", "zh-CN": "要获取的最大事件数" },
  },
  all: {
    type: "switch",
    description: {
      "en-US": "Fetch all pages by following the cursor",
      "zh-CN": "跟随 Cursor 获取全部分页",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "List event history for a session", "zh-CN": "列出 Session 的事件历史" },
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
