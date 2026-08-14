import { expect, test } from "vite-plus/test";
import { parseSSE } from "../src/client/stream.ts";

async function collectEvents(
  chunks: string[],
): Promise<Array<{ data: string; event?: string; id?: string }>> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  const response = new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
  const events: Array<{ data: string; event?: string; id?: string }> = [];
  for await (const event of parseSSE(response)) {
    events.push(event);
  }
  return events;
}

test("parseSSE：单 chunk 完整事件保持原行为", async () => {
  const events = await collectEvents([
    'event: message\ndata: {"ok":true}\nid: 1\n\ndata: plain\n\n',
  ]);
  expect(events).toEqual([{ data: '{"ok":true}', event: "message", id: "1" }, { data: "plain" }]);
});

test("parseSSE：多行 data 与注释保持原行为", async () => {
  const events = await collectEvents([": keep-alive\ndata: line1\ndata: line2\n\n"]);
  expect(events).toEqual([{ data: "line1\nline2" }]);
});

test("parseSSE：跨 chunk 保留 event 类型", async () => {
  const events = await collectEvents(["event: endpoint\n", "data: /message?sessionId=abc\n\n"]);
  expect(events).toEqual([{ data: "/message?sessionId=abc", event: "endpoint" }]);
});

test("parseSSE：跨 chunk 保留 id，且多事件连续正确", async () => {
  const events = await collectEvents([
    "id: a\nevent: message\n",
    'data: {"n":1}\n\n',
    "event: message\ndata: ",
    '{"n":2}\n\n',
  ]);
  expect(events).toEqual([
    { data: '{"n":1}', event: "message", id: "a" },
    { data: '{"n":2}', event: "message" },
  ]);
});

test("parseSSE：CRLF 行尾可解析 endpoint", async () => {
  const events = await collectEvents(["event: endpoint\r\ndata: /message\r\n\r\n"]);
  expect(events).toEqual([{ data: "/message", event: "endpoint" }]);
});

test("parseSSE：纯 CR 行尾可解析 endpoint", async () => {
  const events = await collectEvents(["event: endpoint\rdata: /message\r\r"]);
  expect(events).toEqual([{ data: "/message", event: "endpoint" }]);
});

test("parseSSE：跨 chunk 的 CRLF（\\r|\\n）不丢事件", async () => {
  const events = await collectEvents(["event: endpoint\r", "\ndata: /message\r\n\r\n"]);
  expect(events).toEqual([{ data: "/message", event: "endpoint" }]);
});

test("parseSSE：EOF without blank line keeps event type", async () => {
  const events = await collectEvents(["event: endpoint\ndata: /message"]);
  expect(events).toEqual([{ data: "/message", event: "endpoint" }]);
});

test("parseSSE：EOF data-only flush keeps prior behavior", async () => {
  const events = await collectEvents(["data: plain"]);
  expect(events).toEqual([{ data: "plain" }]);
});
