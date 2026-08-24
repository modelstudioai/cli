import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { listSessionSummaries } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { fetchAllPages } from "./_engine/pagination.ts";
import {
  CURSOR_FLAGS,
  splitCommaSeparated,
  validateLimitAndPageLimit,
} from "./_engine/api-helpers.ts";

const SESSION_LIST_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
  agent: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Filter by agent name", "zh-CN": "按 Agent 名称筛选" },
  },
  all: {
    type: "switch",
    description: {
      "en-US": "Fetch all pages by following the cursor",
      "zh-CN": "跟随 Cursor 获取全部分页",
    },
  },
  limit: CURSOR_FLAGS.limit,
  page: CURSOR_FLAGS.page,
  statuses: {
    type: "string",
    valueHint: "<statuses>",
    description: {
      "en-US": "Comma-separated session statuses",
      "zh-CN": "Session 状态，多个以逗号分隔",
    },
  },
  createdAtGte: {
    type: "string",
    valueHint: "<timestamp>",
    description: {
      "en-US": "Created at or after this RFC 3339 timestamp",
      "zh-CN": "创建时间不早于该 RFC 3339 时间戳",
    },
  },
  createdAtLte: {
    type: "string",
    valueHint: "<timestamp>",
    description: {
      "en-US": "Created at or before this RFC 3339 timestamp",
      "zh-CN": "创建时间不晚于该 RFC 3339 时间戳",
    },
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Target provider", "zh-CN": "目标 Provider" },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "List sessions from the provider",
    "zh-CN": "列出 Provider 中的 Session",
  },
  auth: "apiKey",
  usageArgs: "[--agent <name>] [--statuses <statuses>] [--limit <n>] [--page <cursor>] [--all]",
  flags: SESSION_LIST_FLAGS,
  exampleArgs: ["", "--agent assistant", "--all"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const {
      items: summaries,
      hasMore,
      nextPage,
    } = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        return fetchAllPages(
          async (page) => {
            const result = await listSessionSummaries(runtime, {
              agent: flags.agent,
              provider: flags.provider,
              filter: {
                page,
                limit: flags.limit,
                statuses: splitCommaSeparated(flags.statuses),
                created_at_gte: flags.createdAtGte,
                created_at_lte: flags.createdAtLte,
              },
            });
            return {
              items: result.summaries,
              hasMore: result.hasMore,
              nextPage: result.nextPage,
            };
          },
          flags.all,
          flags.page,
        );
      }),
    );

    const sessions = summaries.map((summary) => summary.session);
    if (format === "json") {
      emitResult({ sessions, has_more: hasMore, next_page: nextPage }, format);
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
