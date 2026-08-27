/** Minimal SSE parser for the knowledge chat stream: `event:`/`data:` lines, events split on blank lines. */

export interface SseEvent {
  event?: string;
  data: string;
}

/**
 * Parse one SSE byte stream into events.
 * @param body - the response body stream.
 * @returns events in stream order; multi-`data:` events join with newlines per the SSE spec.
 */
export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | undefined;
  let data: string[] = [];

  const flush = (): SseEvent | undefined => {
    if (data.length === 0) return undefined;
    const out = { event, data: data.join("\n") };
    event = undefined;
    data = [];
    return out;
  };

  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    buffer += done ? "" : decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (line === "") {
        const out = flush();
        if (out) yield out;
      } else if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      }
      // comment/id/retry lines are irrelevant to this API and are skipped
    }
    if (done) {
      const out = flush();
      if (out) yield out;
      return;
    }
  }
}
