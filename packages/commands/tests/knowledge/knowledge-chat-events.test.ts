import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { parseSSE } from "bailian-cli-core";
import { createChatAccumulator } from "../../src/commands/knowledge/chat-events.ts";
const fixture = readFileSync(new URL("./fixtures/rag-media-chat.sse", import.meta.url), "utf8");
async function replay(text: string) {
  const accumulator = createChatAccumulator();
  for await (const event of parseSSE(new Response(text))) accumulator.accept(event);
  return accumulator.finish();
}
test("separates final answer, tool records, docs and final usage while preserving raw events", async () => {
  const result = await replay(fixture);
  expect(result.answer).toBe("最终答案");
  expect(result.request_id).toBe("request-fixture");
  expect(result.docs).toHaveLength(1);
  expect(result.docs[0]).toMatchObject({
    video_url: ["https://example.com/video.mp4"],
    future: { preserved: true },
  });
  expect(result.tools).toHaveLength(2);
  expect(result.phases.some((phase) => phase.content === "规划内容")).toBe(true);
  expect(result.usage).toEqual({
    input_tokens: 10,
    output_tokens: 2,
    total_tokens: 12,
    cached_tokens: 0,
  });
  expect(result.events).toHaveLength(7);
  expect(result.events[0]?.data).toContain("unknown_extension");
});
test("persistent step works without step_change", async () => {
  const result = await replay(fixture.replace(/,?\s*"step_change":\s*"[^"]+"/g, ""));
  expect(result.answer).toBe("最终答案");
});
test("an interrupted stream cannot report partial generation as success", async () => {
  await expect(
    replay(fixture.split("data: ")[0] + fixture.slice(0, fixture.lastIndexOf("data: {"))),
  ).rejects.toMatchObject({ exitCode: 1 });
});
test("tool-only output never becomes the final answer", async () => {
  await expect(
    replay(
      'data: {"output":{"choices":[{"message":{"role":"tool","content":"tool summary"}}]}}\n\ndata: [DONE]\n\n',
    ),
  ).rejects.toMatchObject({ exitCode: 1 });
});
test("SSE error frame preserves backend message", async () => {
  await expect(
    replay('event: error\ndata: {"code":"Backend.Error","message":"原始错误"}\n\n'),
  ).rejects.toMatchObject({ message: "原始错误", exitCode: 1 });
});
test("unknown events stay raw and never become answer", async () => {
  const result = await replay("event: future\ndata: opaque\n\n" + fixture);
  expect(result.events[0]).toEqual({ event: "future", data: "opaque" });
  expect(result.answer).toBe("最终答案");
});

test("UTF-8 and SSE framing survive one-byte network chunks", async () => {
  const bytes = new TextEncoder().encode(fixture);
  let offset = 0;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        if (offset < bytes.length) controller.enqueue(bytes.slice(offset, ++offset));
        else controller.close();
      },
    }),
  );
  const accumulator = createChatAccumulator();
  for await (const event of parseSSE(response)) accumulator.accept(event);
  expect(accumulator.finish().answer).toBe("最终答案");
});
