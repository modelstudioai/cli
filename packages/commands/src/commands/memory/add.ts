import {
  defineCommand,
  UsageError,
  BailianError,
  ExitCode,
  memoryAddAsyncPath,
  memoryEndpoint,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
  type MemoryAddAsyncResponse,
  type MemoryAddRequest,
  type MemoryEvent,
  type MemoryMessage,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_RATE_LIMIT_NOTE,
  MEMORY_WORKSPACE_NOTE,
  MAX_CUSTOM_CONTENT_LENGTH,
  PROJECT_IDS_FLAG,
  SKILL_METADATA_FLAGS,
  WORKSPACE_FLAG,
  checkMemoryScopeLengths,
  checkSkillMetadataFlags,
  parseJsonArrayFlag,
  parseJsonObjectFlag,
  resolveWorkspaceId,
} from "./shared.ts";
import { isMemoryEventSuccess, pollMemoryEvents } from "./poll-event.ts";

const ADD_FLAGS = {
  userId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Memory entity ID that owns the memory (required)",
      "zh-CN": "记忆实体 ID，标识记忆归属对象（必填）",
    },
    required: true,
  },
  messages: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US":
        'Messages JSON array: [{"role":"user","content":"..."},...]; role user/assistant/tool, OpenAI tool_calls supported (max 50)',
      "zh-CN":
        '消息 JSON 数组：[{"role":"user","content":"..."},...]；role 支持 user/assistant/tool，兼容 OpenAI tool_calls（最多 50 条）',
    },
  },
  content: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Custom content to memorize verbatim; takes precedence over --messages",
      "zh-CN": "要原样记忆的自定义内容；优先级高于 --messages",
    },
  },
  profileSchema: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Profile schema ID; without it no user profile is extracted",
      "zh-CN": "画像模板 ID；不传则不提取用户画像",
    },
  },
  extractMode: {
    type: "string",
    valueHint: "<mode>",
    choices: ["profile_only"] as const,
    description: {
      "en-US":
        "Extract only a user profile; requires --profile-schema and --messages, without --content",
      "zh-CN": "仅抽取用户画像；需传 --profile-schema 和 --messages，不能传 --content",
    },
  },
  ...SKILL_METADATA_FLAGS,
  metaData: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": 'Custom metadata JSON object: {"location_name":"Beijing"}',
      "zh-CN": '用户自定义信息 JSON 对象：{"location_name":"北京"}',
    },
  },

  wait: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US":
        "Polling budget in seconds before giving up (default: 120); 0 prints the event ID and returns right after submission",
      "zh-CN": "轮询预算秒数，耗尽后按超时退出（默认：120）；0 表示提交后立即返回 event_id",
    },
  },
  ...PROJECT_IDS_FLAG,
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;
type AddFlags = ParsedFlags<typeof ADD_FLAGS>;

/** Max messages accepted per AddMemory call (a Q&A pair counts as 2). */
const MAX_MESSAGES = 50;
/** Default polling budget for the async extraction task. */
const DEFAULT_WAIT_SECONDS = 120;
/** Delay between two GET /events/{id} polls. */
const POLL_INTERVAL_MS = 3_000;

const VALID_ROLES = new Set(["user", "assistant", "tool"]);

/**
 * Structural guard for the OpenAI-style message envelope, so `--dry-run`
 * already rejects shapes the server would refuse. Content itself (string or
 * multimodal array) is passed through untouched.
 */
function assertMessageShapes(messages: MemoryMessage[]): void {
  messages.forEach((message, index) => {
    const position = `--messages[${index}]`;
    if (!VALID_ROLES.has(message.role)) {
      throw new UsageError(`${position}.role must be one of user / assistant / tool`);
    }
    if (message.role === "tool" && !message.tool_call_id) {
      throw new UsageError(`${position}.tool_call_id is required when role is "tool"`);
    }
    if (message.tool_calls !== undefined) {
      if (!Array.isArray(message.tool_calls)) {
        throw new UsageError(`${position}.tool_calls must be an array`);
      }
      message.tool_calls.forEach((toolCall, toolCallIndex) => {
        const callPosition = `${position}.tool_calls[${toolCallIndex}]`;
        if (!toolCall || typeof toolCall !== "object" || !toolCall.id) {
          throw new UsageError(`${callPosition}.id is required`);
        }
        if (!toolCall.function || typeof toolCall.function !== "object") {
          throw new UsageError(`${callPosition}.function is required`);
        }
        if (!toolCall.function.name) {
          throw new UsageError(`${callPosition}.function.name is required`);
        }
      });
    }
  });
}

/** Text rendering of terminal events: result lines for extraction tasks, one status line per profile task. */
function emitEventsText(events: MemoryEvent[]): void {
  let emitted = 0;
  for (const event of events) {
    const status = event.status ?? "UNKNOWN";
    const label = `${event.resource_type ?? "memory"} ${event.resource_id ?? ""}`.trim();
    if (isMemoryEventSuccess(status)) {
      const results = event.result ?? [];
      if (results.length === 0) {
        emitBare(`${label}: ${status} (no memory change)`);
        emitted += 1;
        continue;
      }
      for (const item of results) {
        const target =
          event.resource_type === "user_profile"
            ? `user_profile ${item.name ?? event.resource_id ?? "-"}`
            : (item.memory_node_id ?? "-");
        emitBare(`[${item.event ?? "ADD"}] ${target} ${item.content ?? ""}`);
        emitted += 1;
      }
      continue;
    }
    // UNRECORDED and any other non-success terminal status: surface as-is.
    emitBare(`${label}: ${status}`);
    emitted += 1;
  }
  if (emitted === 0) emitBare("No memory node changed.");
}

export default defineCommand({
  description: {
    "en-US": "Add memory from messages or custom content (async extraction)",
    "zh-CN": "从消息或自定义内容添加记忆（异步抽取）",
  },
  auth: "apiKey",
  usageArgs: "--user-id <id> [--messages <json>] [--content <text>] [flags]",
  flags: ADD_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "When --content is set, the server ignores --messages. Custom content accepts one --project-id; messages accept up to five.",
      "zh-CN":
        "传了 --content 时服务端会忽略 --messages。自定义内容仅支持一个 --project-id；消息抽取最多支持五个。",
    },
    {
      "en-US":
        "The command submits an async extraction task, then polls it internally until every task reaches a terminal state (budget: --wait, default 120s). One call can add, update or delete several memory nodes at once.",
      "zh-CN":
        "命令提交异步抽取任务后在内部轮询，直到全部任务到达终态（预算 --wait，默认 120 秒）。一次调用可能同时新增、更新或删除多条记忆。",
    },
    {
      "en-US":
        "On timeout the extraction may still finish in the background; check results later with `memory list` / `memory search` / `memory profile get`.",
      "zh-CN":
        "超时后抽取仍可能在后台完成；稍后可用 `memory list` / `memory search` / `memory profile get` 查看结果。",
    },
    MEMORY_RATE_LIMIT_NOTE,
  ],
  exampleArgs: [
    {
      "en-US":
        '--user-id user1 --content "The user likes Python programming" --workspace-id ws_xxx',
      "zh-CN": '--user-id user1 --content "用户喜欢使用 Python 编程" --workspace-id ws_xxx',
    },
    {
      "en-US": '--user-id user1 --messages \'[{"role":"user","content":"I like traveling"}]\'',
      "zh-CN": '--user-id user1 --messages \'[{"role":"user","content":"我喜欢旅行"}]\'',
    },
    {
      "en-US":
        '--user-id user1 --messages \'[{"role":"user","content":"I live in Beijing"}]\' --profile-schema schema_xxx --extract-mode profile_only',
      "zh-CN":
        '--user-id user1 --messages \'[{"role":"user","content":"我居住在北京"}]\' --profile-schema schema_xxx --extract-mode profile_only',
    },
    {
      "en-US":
        '--user-id user1 --content "Summarize meeting minutes" --project-id skill_project_xxx --skill-name "meeting-summary" --skill-description "Extract key points and generate a summary" --skill-tags office --skill-tags summary',
      "zh-CN":
        '--user-id user1 --content "整理会议纪要" --project-id skill_project_xxx --skill-name "会议纪要整理" --skill-description "自动提取会议重点并生成摘要" --skill-tags 办公 --skill-tags 总结',
    },
    {
      "en-US": '--user-id user1 --content "Attended WAIC" --wait 0',
      "zh-CN": '--user-id user1 --content "参加了 WAIC" --wait 0',
    },
  ],
  validate: (flags: AddFlags) => {
    if (!flags.messages && !flags.content) return "Provide --messages or --content.";
    if (
      flags.extractMode === "profile_only" &&
      (!flags.profileSchema || !flags.messages || flags.content !== undefined)
    )
      return "--extract-mode profile_only requires --profile-schema and --messages without --content. / 仅画像模式需传 --profile-schema 和 --messages，不能传 --content。";
    if (flags.content && (flags.projectId?.length ?? 0) > 1)
      return "--content accepts only one --project-id. / 自定义内容仅支持一个 --project-id。";
    if ((flags.projectId?.length ?? 0) > 5)
      return "At most five --project-id values are allowed. / --project-id 最多传五个。";
    const scopeError = checkMemoryScopeLengths(flags);
    if (scopeError) return scopeError;
    if (flags.content && flags.content.length > MAX_CUSTOM_CONTENT_LENGTH)
      return `--content must be at most ${MAX_CUSTOM_CONTENT_LENGTH} characters.`;
    const skillError = checkSkillMetadataFlags(flags);
    if (skillError) return skillError;
    if (flags.wait !== undefined && flags.wait < 0)
      return "--wait must be a non-negative number of seconds.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    const body: MemoryAddRequest = { user_id: flags.userId };

    if (flags.messages) {
      const messages = parseJsonArrayFlag<MemoryMessage>("--messages", flags.messages);
      if (messages.length > MAX_MESSAGES) {
        throw new UsageError(`--messages accepts at most ${MAX_MESSAGES} messages`);
      }
      assertMessageShapes(messages);
      body.messages = messages;
    }

    if (flags.content) body.custom_content = flags.content;
    if (flags.metaData) body.meta_data = parseJsonObjectFlag("--meta-data", flags.metaData);
    if (flags.profileSchema) body.profile_schema = flags.profileSchema;
    if (flags.projectId?.length) {
      if (flags.content) body.project_id = flags.projectId[0];
      else body.project_ids = flags.projectId;
    }
    if (flags.extractMode) body.extract_mode = flags.extractMode;
    if (
      flags.skillName !== undefined &&
      flags.skillDescription !== undefined &&
      flags.skillTags !== undefined
    ) {
      body.skill_name = flags.skillName;
      body.skill_description = flags.skillDescription;
      body.skill_tags = flags.skillTags;
    }
    if (flags.libraryId) body.memory_library_id = flags.libraryId;

    const format = detectOutputFormat(settings.output);
    const workspaceId = resolveWorkspaceId(ctx);
    const url = memoryEndpoint(workspaceId, memoryAddAsyncPath());

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "POST", request: body }, format);
      return;
    }

    const submission = await ctx.client.requestJson<MemoryAddAsyncResponse>({
      path: url,
      method: "POST",
      body,
    });

    const waitSeconds = flags.wait ?? DEFAULT_WAIT_SECONDS;
    const eventId = submission.event_id;

    // --wait 0 (or a submission without event_id): print the receipt and let
    // the caller track the result via the result-side commands.
    if (waitSeconds === 0 || !eventId) {
      if (settings.quiet || format === "text") {
        emitBare(
          eventId
            ? `Submitted: event ${eventId} (${(submission.events ?? []).length} task(s) pending).`
            : "Submitted (no event ID returned).",
        );
      } else {
        emitResult(submission, format);
      }
      return;
    }

    const poll = await pollMemoryEvents({
      client: ctx.client,
      workspaceId,
      eventId,
      timeoutMs: waitSeconds * 1000,
      intervalMs: POLL_INTERVAL_MS,
      onPoll: settings.verbose
        ? (round, events) => {
            const statuses = events
              .map((event) => `${event.resource_type ?? "task"}=${event.status ?? "UNKNOWN"}`)
              .join(" ");
            process.stderr.write(`[poll ${round}] ${eventId} ${statuses}\n`);
          }
        : undefined,
    });

    if (poll.timedOut) {
      throw new BailianError(
        `Memory extraction timed out after ${waitSeconds}s (event ${eventId}); it may still be running in the background.`,
        ExitCode.TIMEOUT,
        "Check results later with `memory list`, `memory search --memory-types skill` or `memory profile get`.",
      );
    }

    const events = poll.events;
    const failedEvents = events.filter((event) => event.status === "FAILED");
    const reportableEvents = events.filter((event) => event.status !== "FAILED");

    // Partial failure: surface the completed part first, then propagate the
    // failed events verbatim (server errors are never translated).
    if (settings.quiet || format === "text") {
      emitEventsText(reportableEvents);
    } else {
      emitResult({ request_id: submission.request_id, event_id: eventId, events }, format);
    }

    if (failedEvents.length > 0) {
      throw new BailianError(
        `Memory extraction event ${eventId} has failed task(s): ${JSON.stringify(failedEvents)}`,
        ExitCode.GENERAL,
      );
    }
  },
});
