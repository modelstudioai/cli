import type { ProviderSessionEvent, SessionEventInput } from "@openagentpack/sdk";
import {
  isTerminalSessionStatus,
  listSessionEvents,
  sendRemoteSessionEvents,
  SessionEventSchema,
  streamSessionEvents,
} from "@openagentpack/sdk";
import { sanitizeSessionEvents } from "@openagentpack/sdk/session-events";
import { BailianError, defineCommand, detectOutputFormat, ExitCode } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  emitCollection,
  splitCommaSeparated,
  validateLimitAndPageLimit,
} from "./_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { readJsonInput } from "./_engine/output-file.ts";
import { fetchAllPages } from "./_engine/pagination.ts";

const SESSION_ID_FLAG = {
  sessionId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Session ID", "zh-CN": "Session ID" },
  },
} as const;

const EVENT_LIST_FLAGS = {
  ...API_TARGET_FLAGS,
  ...SESSION_ID_FLAG,
  ...CURSOR_FLAGS,
  order: {
    type: "string",
    valueHint: "<order>",
    choices: ["asc", "desc"] as const,
    description: { "en-US": "Event order: asc or desc", "zh-CN": "事件顺序：asc 或 desc" },
  },
  types: {
    type: "string",
    valueHint: "<types>",
    description: {
      "en-US": "Comma-separated raw event types",
      "zh-CN": "原始事件类型，多个以逗号分隔",
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

const EVENT_SEND_FLAGS = {
  ...API_TARGET_FLAGS,
  ...SESSION_ID_FLAG,
  event: {
    type: "string",
    valueHint: "<json|@path>",
    required: true,
    description: {
      "en-US": "Raw event object/array as JSON or @event.json",
      "zh-CN": "原始事件对象/数组 JSON，或 @event.json",
    },
  },
} as const;

const EVENT_STREAM_FLAGS = {
  ...API_TARGET_FLAGS,
  ...SESSION_ID_FLAG,
  afterId: {
    type: "string",
    valueHint: "<event-id>",
    description: { "en-US": "Resume after this event ID", "zh-CN": "从该 Event ID 之后继续" },
  },
} as const;

function eventRows(events: ProviderSessionEvent[]): string[][] {
  return events.map((event) => [
    displayValue(event.id),
    event.raw_type,
    displayValue(event.session_thread_id),
    displayValue(event.content ?? event.status ?? event.tool_name, 70),
  ]);
}

function normalizeEventInput(value: unknown): SessionEventInput[] {
  const values = Array.isArray(value) ? value : [value];
  if (
    values.length === 0 ||
    values.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))
  ) {
    throw new BailianError(
      "Event input must be a JSON object or a non-empty array of objects.",
      ExitCode.USAGE,
    );
  }
  for (const [index, entry] of values.entries()) {
    const validation = SessionEventSchema.safeParse(entry);
    if (validation.success) continue;
    const issue = validation.error.issues[0];
    const path = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    throw new BailianError(
      `Invalid event at index ${index}${path}: ${issue?.message ?? "does not match the Session event schema"}.`,
      ExitCode.USAGE,
    );
  }
  return values as SessionEventInput[];
}

export const managedAgentSessionEventList = defineCommand({
  description: {
    "en-US": "List events for a Managed Agent session",
    "zh-CN": "列出托管 Agent Session 事件",
  },
  auth: "apiKey",
  usageArgs:
    "--session-id <id> [--types <types>] [--order asc|desc] [--limit <n>] [--page <cursor>] [--all]",
  flags: EVENT_LIST_FLAGS,
  exampleArgs: ["--session-id sess_abc", "--session-id sess_abc --all --output json"],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US": "--types is applied client-side to each page returned by the provider.",
      "zh-CN": "--types 会在客户端对 Provider 返回的每一页结果进行过滤。",
    },
  ],
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listSessionEvents(runtime, ctx.flags.sessionId, {
              provider: "bailian",
              limit: ctx.flags.limit,
              page_token: page,
              order: ctx.flags.order,
              types: splitCommaSeparated(ctx.flags.types),
              created_at_gte: ctx.flags.createdAtGte,
              created_at_lte: ctx.flags.createdAtLte,
            });
            return {
              items: response.events,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          ctx.flags.all,
          ctx.flags.page,
        );
      }),
    );
    emitCollection({
      format,
      key: "events",
      items: sanitizeSessionEvents(result.items),
      headers: ["ID", "TYPE", "THREAD", "CONTENT"],
      rows: eventRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No events found.",
    });
  },
});

export const managedAgentSessionEventSend = defineCommand({
  description: {
    "en-US": "Send raw events to a Managed Agent session",
    "zh-CN": "向托管 Agent Session 发送原始事件",
  },
  auth: "apiKey",
  usageArgs: "--session-id <id> --event <json|@path>",
  flags: EVENT_SEND_FLAGS,
  exampleArgs: [
    '--session-id sess_abc --event \'{"type":"message","role":"user","content":[{"type":"text","text":"hello"}]}\'',
    "--session-id sess_abc --event @event.json",
  ],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const events = normalizeEventInput(await readJsonInput(ctx.flags.event));
    if (ctx.settings.dryRun) {
      emitResult({ would_send_events: events, session_id: ctx.flags.sessionId }, format);
      return;
    }
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return sendRemoteSessionEvents(runtime, ctx.flags.sessionId, events, {
          provider: "bailian",
        });
      }),
    );
    if (format === "json") emitResult({ session_id: ctx.flags.sessionId, ...result }, format);
    else emitBare(`Sent ${events.length} event(s): ${result.event_ids.join(", ")}`);
  },
});

export const managedAgentSessionEventStream = defineCommand({
  description: {
    "en-US": "Stream events from a Managed Agent session",
    "zh-CN": "流式读取托管 Agent Session 事件",
  },
  auth: "apiKey",
  usageArgs: "--session-id <id> [--after-id <event-id>]",
  flags: EVENT_STREAM_FLAGS,
  exampleArgs: ["--session-id sess_abc", "--session-id sess_abc --after-id evt_123 --output json"],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US":
        "When the provider has no native event cursor, --after-id resumes through paginated history polling and event ID de-duplication.",
      "zh-CN":
        "当 Provider 不支持原生事件 Cursor 时，--after-id 会通过分页历史轮询和 Event ID 去重实现续传。",
    },
  ],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        const events: ProviderSessionEvent[] = [];
        for await (const event of streamSessionEvents(runtime, ctx.flags.sessionId, {
          provider: "bailian",
          after_id: ctx.flags.afterId,
        })) {
          events.push(event);
          if (format !== "json") emitBare(JSON.stringify(sanitizeSessionEvents([event])[0]));
          if (event.type === "status" && isTerminalSessionStatus(event.status)) break;
        }
        if (format === "json") {
          emitResult(
            { session_id: ctx.flags.sessionId, events: sanitizeSessionEvents(events) },
            format,
          );
        }
      }),
    );
  },
});
