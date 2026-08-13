import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export interface ServerSentEvent {
  event?: string;
  data: string;
  id?: string;
}

export async function* parseSSE(response: Response): AsyncGenerator<ServerSentEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  // Guard against a hostile or malfunctioning stream that never emits a newline
  // (or builds a single absurdly large event): bound the in-memory buffer so the
  // parser cannot be driven to exhaust process memory.
  const MAX_SSE_BUFFER = 16 * 1024 * 1024; // 16 MiB

  try {
    let event: Partial<ServerSentEvent> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_SSE_BUFFER) {
        throw new BailianError("SSE stream exceeded the maximum buffer size.", ExitCode.GENERAL);
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line === "") {
          if (event.data !== undefined) {
            yield { data: event.data, event: event.event, id: event.id };
          }
          event = {};
          continue;
        }

        if (line.startsWith(":")) continue; // comment

        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;

        const field = line.slice(0, colonIndex);
        const value = line.slice(colonIndex + 1).trimStart();

        switch (field) {
          case "data":
            event.data = event.data !== undefined ? `${event.data}\n${value}` : value;
            if (event.data.length > MAX_SSE_BUFFER) {
              throw new BailianError(
                "SSE event exceeded the maximum buffer size.",
                ExitCode.GENERAL,
              );
            }
            break;
          case "event":
            event.event = value;
            break;
          case "id":
            event.id = value;
            break;
        }
      }
    }

    // Flush remaining
    if (buffer.trim() && buffer.includes("data:")) {
      const colonIndex = buffer.indexOf(":");
      if (colonIndex !== -1) {
        yield { data: buffer.slice(colonIndex + 1).trimStart() };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
