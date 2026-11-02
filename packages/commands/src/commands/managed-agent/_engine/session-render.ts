import {
  type CollectedSessionEvents,
  isTerminalSessionStatus,
  type ProviderSessionEvent,
} from "@openagentpack/sdk";
import { sanitizeSessionEvents } from "@openagentpack/sdk/session-events";
import { BailianError, ExitCode, type CommandContext } from "bailian-cli-core";

/** Skip user echo + thinking noise in live rendering (mirrors OpenAgentPack CLI). */
function shouldRenderLiveEvent(event: ProviderSessionEvent): boolean {
  return event.type !== "thinking" && !(event.type === "message" && event.role === "user");
}

type RenderHost = Pick<CommandContext, "settings" | "output" | "localize">;
function renderTerminalStatus(ctx: RenderHost, status: string): void {
  ctx.output.info({ "en-US": `\n[session ${status}]`, "zh-CN": `\n[会话 ${status}]` });
}

function findLastSessionError(events: readonly ProviderSessionEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type === "error" && event.content?.trim()) return event.content;
  }
  return undefined;
}

function throwIfSessionFailed(ctx: RenderHost, status: string | undefined, message?: string): void {
  if (status !== "failed") return;
  throw new BailianError(
    message ?? ctx.localize({ "en-US": "Session failed.", "zh-CN": "会话失败。" }),
    ExitCode.GENERAL,
  );
}

/**
 * Session identity echoed at the head of the `--output json` envelope so
 * callers can read the (possibly just-created) session id from stdout and
 * chain `session send/get/events/delete` — without scraping stderr.
 * Undefined fields are dropped by JSON.stringify.
 */
export interface SessionRenderContext {
  session_id?: string;
  provider?: string;
  agent?: string;
}

/**
 * Consume an SSE stream. Text mode renders live (assistant text → stdout,
 * diagnostics → stderr). JSON mode collects every event and emits exactly one
 * JSON document at the end — `--output json` guarantees a single valid JSON
 * result on stdout (mirrors `text chat --stream --output json`). `context`
 * prefixes the envelope with the session identity.
 */
export async function streamAndRenderEvents(
  ctx: RenderHost,
  events: AsyncIterable<ProviderSessionEvent>,
  context: SessionRenderContext = {},
): Promise<void> {
  const collected: ProviderSessionEvent[] = [];
  let terminalStatus: string | undefined;
  let errorMessage: string | undefined;
  try {
    for await (const event of events) {
      collected.push(event);
      renderEvent(ctx, event);
      if (event.type === "error" && event.content?.trim()) errorMessage = event.content;
      if (event.type === "status" && isTerminalSessionStatus(event.status)) {
        terminalStatus = event.status;
        renderTerminalStatus(ctx, event.status ?? "");
        break;
      }
    }
  } catch (error) {
    if (context.session_id)
      ctx.output.warning({
        code: "AGENT_SESSION_INTERRUPTED",
        message: {
          "en-US": `Session ${context.session_id} was created; reading its events was interrupted.`,
          "zh-CN": `会话 ${context.session_id} 已创建，读取事件时中断。`,
        },
        details: context,
      });
    throw error;
  }
  ctx.output.result({ ...context, events: sanitizeSessionEvents(collected) }, { text: "" });
  throwIfSessionFailed(ctx, terminalStatus, errorMessage);
}

/** Assistant text → stdout (data channel); everything else → stderr (diagnostics). */
function renderEvent(ctx: RenderHost, event: ProviderSessionEvent): void {
  if (!shouldRenderLiveEvent(event)) return;
  if (event.type === "message" && event.content) {
    if (ctx.settings.output === "text") process.stdout.write(event.content);
  } else if (event.type === "tool_use") {
    ctx.output.info({
      "en-US": `\n[tool] ${event.tool_name}`,
      "zh-CN": `\n[工具] ${event.tool_name}`,
    });
  } else if (event.type === "tool_result" && event.content) {
    const preview =
      event.content.length > 200 ? `${event.content.slice(0, 200)}...` : event.content;
    ctx.output.info(preview);
  } else if (event.type === "status") {
    if (event.status === "running") renderTerminalStatus(ctx, "running");
  } else if (event.type === "error") {
    ctx.output.warning({
      code: "AGENT_SESSION_EVENT_ERROR",
      message: event.content ?? {
        "en-US": "Unknown session error",
        "zh-CN": "未知会话错误",
      },
    });
  }
}

/** Render a polled (non-streaming) collected result. `context` prefixes the JSON envelope. */
export function renderCollectedEvents(
  ctx: RenderHost,
  result: CollectedSessionEvents,
  context: SessionRenderContext = {},
): void {
  for (const event of result.result.events) renderEvent(ctx, event);
  renderTerminalStatus(ctx, result.terminalStatus);
  ctx.output.result(
    {
      ...context,
      events: sanitizeSessionEvents(result.result.events),
      has_more: result.result.has_more,
      next_page: result.result.next_page,
    },
    { text: "" },
  );
  throwIfSessionFailed(ctx, result.terminalStatus, findLastSessionError(result.result.events));
}

/** Split a comma-separated --memory-stores value. */
export function parseMemoryStores(value?: string): string[] | undefined {
  return value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined;
}
