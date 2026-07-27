import {
  type CollectedSessionEvents,
  isTerminalSessionStatus,
  type ProviderSessionEvent,
} from "@openagentpack/sdk";
import { sanitizeSessionEvents } from "@openagentpack/sdk/session-events";

/** Skip user echo + thinking noise in live rendering (mirrors OpenAgentPack CLI). */
function shouldRenderLiveEvent(event: ProviderSessionEvent): boolean {
  return event.type !== "thinking" && !(event.type === "message" && event.role === "user");
}

function renderTerminalStatus(status: string, json: boolean): void {
  if (json) return;
  process.stderr.write(`\n[session ${status}]\n`);
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
  events: AsyncIterable<ProviderSessionEvent>,
  json: boolean,
  context: SessionRenderContext = {},
): Promise<void> {
  const collected: ProviderSessionEvent[] = [];
  for await (const event of events) {
    if (json) collected.push(event);
    else renderEvent(event);
    if (event.type === "status" && isTerminalSessionStatus(event.status)) {
      renderTerminalStatus(event.status ?? "", json);
      break;
    }
  }
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ...context, events: sanitizeSessionEvents(collected) }, null, 2)}\n`,
    );
  }
}

/** Assistant text → stdout (data channel); everything else → stderr (diagnostics). */
function renderEvent(event: ProviderSessionEvent): void {
  if (!shouldRenderLiveEvent(event)) return;
  if (event.type === "message" && event.content) {
    process.stdout.write(event.content);
  } else if (event.type === "tool_use") {
    process.stderr.write(`\n[tool] ${event.tool_name}\n`);
  } else if (event.type === "tool_result" && event.content) {
    const preview =
      event.content.length > 200 ? `${event.content.slice(0, 200)}...` : event.content;
    process.stderr.write(`${preview}\n`);
  } else if (event.type === "status") {
    if (event.status === "running") process.stderr.write("\n[session running]\n");
  } else if (event.type === "error") {
    process.stderr.write(`\n[error] ${event.content ?? "unknown error"}\n`);
  }
}

/** Render a polled (non-streaming) collected result. `context` prefixes the JSON envelope. */
export function renderCollectedEvents(
  result: CollectedSessionEvents,
  json: boolean,
  context: SessionRenderContext = {},
): void {
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...context,
          events: sanitizeSessionEvents(result.result.events),
          has_more: result.result.has_more,
          next_page: result.result.next_page,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  for (const event of result.result.events) renderEvent(event);
  renderTerminalStatus(result.terminalStatus, json);
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
