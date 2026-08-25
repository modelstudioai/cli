/** Buffered consumption of the knowledge chat SSE stream: deltas concatenate into one complete answer. */

import type { ChatStreamChunk } from "./api-types.js";
import { KbApiError } from "./client.js";
import { parseSseStream } from "./sse.js";

export interface ChatResult {
  answer: string;
  requestId?: string;
}

/**
 * Consume one chat SSE response to completion.
 * @param res - the SSE response from KbClient.postSse.
 * @returns the concatenated answer and the last seen request id.
 */
export async function consumeChatStream(res: Response): Promise<ChatResult> {
  if (!res.body) throw new KbApiError("knowledge chat returned no response body");
  let answer = "";
  let requestId: string | undefined;
  for await (const event of parseSseStream(res.body)) {
    if (event.data === "[DONE]") break;
    if (event.event === "error") {
      let message = `knowledge chat stream error: ${event.data}`;
      try {
        const err = JSON.parse(event.data) as { code?: string; message?: string };
        if (err.message)
          message = `knowledge chat stream error${err.code ? ` (${err.code})` : ""}: ${err.message}`;
      } catch {
        /* non-JSON error payload: keep the raw data in the message */
      }
      throw new KbApiError(message);
    }
    let parsed: ChatStreamChunk;
    try {
      parsed = JSON.parse(event.data) as ChatStreamChunk;
    } catch {
      continue;
    } // unparseable keep-alive/comment payloads carry no answer content
    if (parsed.request_id) requestId = parsed.request_id;
    for (const choice of parsed.output?.choices ?? []) {
      if (choice.message?.content) answer += choice.message.content;
    }
  }
  return { answer, requestId };
}
