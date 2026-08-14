import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export interface ServerSentEvent {
  event?: string;
  data: string;
  id?: string;
}

/** Normalize CRLF/CR to LF; hold a trailing `\r` so a split CRLF is not double-broken. */
function takeNormalizedSseLines(buffer: string): { lines: string[]; rest: string } {
  let text = buffer;
  let holdTrailingCr = false;
  if (text.endsWith("\r")) {
    holdTrailingCr = true;
    text = text.slice(0, -1);
  }

  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = text.split("\n");
  const incomplete = parts.pop() ?? "";
  return {
    lines: parts,
    rest: holdTrailingCr ? `${incomplete}\r` : incomplete,
  };
}

function applySseLine(
  line: string,
  event: Partial<ServerSentEvent>,
  maxBuffer: number,
): { event: Partial<ServerSentEvent>; completed?: ServerSentEvent } {
  if (line === "") {
    if (event.data === undefined) {
      return { event: {} };
    }
    return {
      event: {},
      completed: { data: event.data, event: event.event, id: event.id },
    };
  }

  if (line.startsWith(":")) {
    return { event };
  }

  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return { event };
  }

  const field = line.slice(0, colonIndex);
  const fieldValue = line.slice(colonIndex + 1).trimStart();
  const nextEvent: Partial<ServerSentEvent> = { ...event };

  switch (field) {
    case "data":
      nextEvent.data =
        nextEvent.data !== undefined ? `${nextEvent.data}\n${fieldValue}` : fieldValue;
      if (nextEvent.data.length > maxBuffer) {
        throw new BailianError("SSE event exceeded the maximum buffer size.", ExitCode.GENERAL);
      }
      break;
    case "event":
      nextEvent.event = fieldValue;
      break;
    case "id":
      nextEvent.id = fieldValue;
      break;
  }

  return { event: nextEvent };
}

export async function* parseSSE(response: Response): AsyncGenerator<ServerSentEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  const MAX_SSE_BUFFER = 16 * 1024 * 1024; // 16 MiB

  try {
    // Keep partial event fields across chunks.
    let event: Partial<ServerSentEvent> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // EOF: treat any held `\r` as a line ending.
        if (buffer.length > 0) {
          const finalText = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          const parts = finalText.split("\n");
          buffer = parts.pop() ?? "";
          for (const line of parts) {
            const applied = applySseLine(line, event, MAX_SSE_BUFFER);
            event = applied.event;
            if (applied.completed) {
              yield applied.completed;
            }
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_SSE_BUFFER) {
        throw new BailianError("SSE stream exceeded the maximum buffer size.", ExitCode.GENERAL);
      }

      const { lines, rest } = takeNormalizedSseLines(buffer);
      buffer = rest;

      for (const line of lines) {
        const applied = applySseLine(line, event, MAX_SSE_BUFFER);
        event = applied.event;
        if (applied.completed) {
          yield applied.completed;
        }
      }
    }

    // Legacy EOF flush: apply trailing field line and dispatch with event/id intact.
    if (buffer.length > 0) {
      const applied = applySseLine(buffer, event, MAX_SSE_BUFFER);
      event = applied.event;
    }
    if (event.data !== undefined) {
      yield { data: event.data, event: event.event, id: event.id };
    }
  } finally {
    reader.releaseLock();
  }
}
