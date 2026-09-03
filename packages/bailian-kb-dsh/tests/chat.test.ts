import { describe, expect, it } from "vite-plus/test";
import { consumeChatStream } from "../src/chat.js";

function sse(text: string): Response {
  return new Response(text, { status: 200 });
}

function chunk(content: string, finish = ""): string {
  return `data: ${JSON.stringify({ output: { choices: [{ message: { content }, finish_reason: finish }] }, request_id: "r-1" })}\n\n`;
}

describe("consumeChatStream", () => {
  it("concatenates delta content across chunks until [DONE]", async () => {
    const res = sse(chunk("Hello") + chunk(" world", "stop") + "data: [DONE]\n\n");
    const out = await consumeChatStream(res);
    expect(out.answer).toBe("Hello world");
    expect(out.requestId).toBe("r-1");
  });

  it("ignores step_change progress chunks with empty content", async () => {
    const progress = `data: ${JSON.stringify({ output: { choices: [{ message: { content: "", extra: { step_change: "tool_calling" } }, finish_reason: "" }] } })}\n\n`;
    const res = sse(progress + chunk("answer", "stop") + "data: [DONE]\n\n");
    expect((await consumeChatStream(res)).answer).toBe("answer");
  });

  it("throws on an SSE error event with the server message", async () => {
    const res = sse('event: error\ndata: {"code":"Throttling","message":"rate limited"}\n\n');
    await expect(consumeChatStream(res)).rejects.toThrow(/Throttling.*rate limited/);
  });
});
