import type { ProviderSessionInfo } from "@openagentpack/sdk";
import {
  archiveRemoteSession,
  listSessionSummaries,
  updateRemoteSession,
} from "@openagentpack/sdk";
import { BailianError, defineCommand, detectOutputFormat, ExitCode } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  emitCollection,
  matchesQuery,
  SEARCH_FLAGS,
  searchCursorPages,
  splitCommaSeparated,
  validateLimitAndPageLimit,
} from "./_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { readJsonInput } from "./_engine/output-file.ts";

const SESSION_ID_FLAG = {
  sessionId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Session ID", "zh-CN": "Session ID" },
  },
} as const;

const SEARCH_RESOURCE_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  agent: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Filter by configured agent name",
      "zh-CN": "按配置中的 Agent 名称筛选",
    },
  },
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
      "en-US": "Created at or after this timestamp",
      "zh-CN": "创建时间不早于该时间戳",
    },
  },
  createdAtLte: {
    type: "string",
    valueHint: "<timestamp>",
    description: {
      "en-US": "Created at or before this timestamp",
      "zh-CN": "创建时间不晚于该时间戳",
    },
  },
} as const;

const UPDATE_FLAGS = {
  ...API_TARGET_FLAGS,
  ...SESSION_ID_FLAG,
  title: {
    type: "string",
    valueHint: "<title>",
    description: { "en-US": "New session title", "zh-CN": "新的 Session 标题" },
  },
  metadata: {
    type: "string",
    valueHint: "<json|@path>",
    description: {
      "en-US": "String-valued metadata JSON or @file",
      "zh-CN": "值为字符串的 Metadata JSON 或 @file",
    },
  },
} as const;

const ARCHIVE_FLAGS = {
  ...API_TARGET_FLAGS,
  ...SESSION_ID_FLAG,
  yes: {
    type: "switch",
    description: { "en-US": "Confirm session archive", "zh-CN": "确认归档 Session" },
  },
} as const;

function sessionRows(sessions: ProviderSessionInfo[]): string[][] {
  return sessions.map((session) => [
    session.id,
    displayValue(session.title),
    displayValue(session.agent_id),
    session.status,
    displayValue(session.updated_at),
  ]);
}

async function parseMetadata(value?: string): Promise<Record<string, string> | undefined> {
  if (!value) return undefined;
  const parsed = await readJsonInput(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BailianError("--metadata must be a JSON object.", ExitCode.USAGE);
  }
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry !== "string") {
      throw new BailianError(`Metadata value for '${key}' must be a string.`, ExitCode.USAGE);
    }
  }
  return parsed as Record<string, string>;
}

export const managedAgentSessionSearch = defineCommand({
  description: { "en-US": "Search Managed Agent sessions", "zh-CN": "搜索托管 Agent Session" },
  auth: "apiKey",
  usageArgs:
    "--query <text> [--agent <name>] [--statuses <statuses>] [--limit <n>] [--page-limit <n>]",
  flags: SEARCH_RESOURCE_FLAGS,
  exampleArgs: ["--query debug", "--query failed --statuses failed --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return searchCursorPages(
          async (page) => {
            const response = await listSessionSummaries(runtime, {
              agent: ctx.flags.agent,
              provider: ctx.flags.provider,
              filter: {
                page,
                limit: ctx.flags.limit ?? 100,
                statuses: splitCommaSeparated(ctx.flags.statuses),
                created_at_gte: ctx.flags.createdAtGte,
                created_at_lte: ctx.flags.createdAtLte,
              },
            });
            return {
              items: response.summaries,
              hasMore: response.hasMore,
              nextPage: response.nextPage,
            };
          },
          (summary) =>
            matchesQuery(
              ctx.flags.query,
              summary.session.id,
              summary.session.title,
              summary.session.status,
              summary.session.agent_id,
              summary.agentName,
            ),
          ctx.flags.pageLimit,
        );
      }),
    );
    const sessions = result.items.map((summary) => summary.session);
    emitCollection({
      format,
      key: "sessions",
      items: sessions,
      headers: ["ID", "TITLE", "AGENT", "STATUS", "UPDATED"],
      rows: sessionRows(sessions),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      truncated: result.truncated,
      scannedPages: result.scannedPages,
      emptyMessage: "No matching sessions found.",
    });
  },
});

export const managedAgentSessionUpdate = defineCommand({
  description: { "en-US": "Update a Managed Agent session", "zh-CN": "更新托管 Agent Session" },
  auth: "apiKey",
  usageArgs: "--session-id <id> [--title <title>] [--metadata <json|@path>]",
  flags: UPDATE_FLAGS,
  exampleArgs: [
    "--session-id sess_abc --title 'investigation'",
    "--session-id sess_abc --metadata @metadata.json",
  ],
  notes: CREDENTIALS_NOTE,
  validate: (flags) =>
    !flags.title && !flags.metadata ? "Provide --title or --metadata." : undefined,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const input = { title: ctx.flags.title, metadata: await parseMetadata(ctx.flags.metadata) };
    if (ctx.settings.dryRun) {
      emitResult({ would_update_session: ctx.flags.sessionId, input }, format);
      return;
    }
    const session = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return updateRemoteSession(runtime, ctx.flags.sessionId, input, {
          provider: ctx.flags.provider,
        });
      }),
    );
    if (format === "json") emitResult(session, format);
    else emitBare(`Session ${session.id} updated.`);
  },
});

export const managedAgentSessionArchive = defineCommand({
  description: { "en-US": "Archive a Managed Agent session", "zh-CN": "归档托管 Agent Session" },
  auth: "apiKey",
  usageArgs: "--session-id <id> --yes",
  flags: ARCHIVE_FLAGS,
  exampleArgs: ["--session-id sess_abc --dry-run", "--session-id sess_abc --yes"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult({ would_archive_session: ctx.flags.sessionId }, format);
      return;
    }
    if (!ctx.flags.yes) {
      throw new BailianError(
        `Refusing to archive session ${ctx.flags.sessionId} without confirmation.`,
        ExitCode.USAGE,
        "Re-run with --yes or preview with --dry-run.",
      );
    }
    const session = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return archiveRemoteSession(runtime, ctx.flags.sessionId, { provider: ctx.flags.provider });
      }),
    );
    if (format === "json") emitResult({ archived: ctx.flags.sessionId, session }, format);
    else emitBare(`Session ${ctx.flags.sessionId} archived.`);
  },
});
