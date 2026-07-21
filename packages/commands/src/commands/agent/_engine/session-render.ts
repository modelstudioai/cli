import {
  type CollectedSessionEvents,
  isTerminalSessionStatus,
  type ProviderSessionEvent,
} from "@openagentpack/sdk";
import { sanitizeSessionEvent, sanitizeSessionEvents } from "@openagentpack/sdk/session-events";

/** Skip user echo + thinking noise in live rendering (mirrors OpenAgentPack CLI). */
function shouldRenderLiveEvent(event: ProviderSessionEvent): boolean {
  return event.type !== "thinking" && !(event.type === "message" && event.role === "user");
}

function writeJsonLine(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
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

function renderTerminalStatus(status: string, json: boolean): void {
  if (json) return;
  process.stderr.write(`\n[session ${status}]\n`);
}

/** Consume an SSE stream, rendering live (text) or as JSONL (json). */
export async function streamAndRenderEvents(
  events: AsyncIterable<ProviderSessionEvent>,
  json: boolean,
): Promise<void> {
  for await (const event of events) {
    if (json) writeJsonLine(sanitizeSessionEvent(event));
    else renderEvent(event);
    if (event.type === "status" && isTerminalSessionStatus(event.status)) {
      renderTerminalStatus(event.status ?? "", json);
      break;
    }
  }
}

/** Render a polled (non-streaming) collected result. */
export function renderCollectedEvents(result: CollectedSessionEvents, json: boolean): void {
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
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
