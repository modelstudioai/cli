import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createLLMClient } from "./client.ts";

const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const delta = (value: object) => event({ choices: [{ index: 0, delta: value }] });
const finish = (reason = "stop") =>
  event({ choices: [{ index: 0, delta: {}, finish_reason: reason }] });
const client = () =>
  createLLMClient({
    baseUrl: "https://example.invalid",
    apiKey: "test",
    enableThinking: true,
    onThinking() {},
  });

function mockStream(text: string, close = true, bytewise = false) {
  const cancel = vi.fn();
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytewise) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      else controller.enqueue(bytes);
      if (close) controller.close();
    },
    cancel,
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
  return { body, cancel };
}

afterEach(() => vi.unstubAllGlobals());

describe("流式响应生命周期", () => {
  it("HTTP 200 内的错误事件必须报错", async () => {
    mockStream(
      event({ error: { code: "InvalidApiKey", message: "invalid key" } }) + "data: [DONE]\n\n",
    );
    await expect(client().chatWithTools([], [])).rejects.toMatchObject({
      kind: "auth",
      code: "InvalidApiKey",
    });
  });

  it.each([{ code: "ServiceError" }, { code: "ServiceError", message: { detail: "服务不可用" } }])(
    "错误消息缺失或不是字符串时使用明确的默认消息：%j",
    async (error) => {
      mockStream(event({ error }) + "data: [DONE]\n\n");
      await expect(client().chatWithTools([], [])).rejects.toMatchObject({
        kind: "http",
        code: "ServiceError",
        message: "LLM request failed: 服务端错误",
      });
    },
  );

  it("提前 EOF 不得返回部分答案", async () => {
    const { body } = mockStream(delta({ content: "未完成" }));
    await expect(client().chatWithTools([], [])).rejects.toMatchObject({ kind: "parse" });
    expect(body.locked).toBe(false);
  });

  it("完成后立即取消读取并释放锁，不等待连接关闭", async () => {
    const { body, cancel } = mockStream(
      delta({ content: "完成" }) + finish() + "data: [DONE]\n\n",
      false,
    );
    await expect(client().chatWithTools([], [])).resolves.toEqual({
      content: "完成",
      toolCalls: [],
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  }, 300);

  it("拒绝不完整工具参数，即使收到 DONE", async () => {
    mockStream(
      delta({
        tool_calls: [{ index: 0, id: "a", function: { name: "recommend", arguments: "{" } }],
      }) +
        finish("tool_calls") +
        "data: [DONE]\n\n",
    );
    await expect(client().chatWithTools([], [])).rejects.toMatchObject({ kind: "parse" });
  });

  it("拒绝 length 截断，不执行已拼接的工具", async () => {
    mockStream(
      delta({
        tool_calls: [{ index: 0, id: "a", function: { name: "recommend", arguments: "{}" } }],
      }) +
        finish("length") +
        "data: [DONE]\n\n",
    );
    await expect(client().chatWithTools([], [])).rejects.toMatchObject({ kind: "parse" });
  });

  it("交错工具片段、CRLF 和中文逐字节传输保持完整", async () => {
    const text =
      delta({
        reasoning_content: "思考",
        tool_calls: [{ index: 1, id: "b", function: { name: "read_file", arguments: '{"path":' } }],
      }) +
      delta({
        tool_calls: [
          { index: 0, id: "a", function: { name: "use_skill", arguments: '{"skill":"中文"}' } },
        ],
      }) +
      delta({ tool_calls: [{ index: 1, function: { arguments: '"目录"}' } }] }) +
      finish("tool_calls") +
      "data: [DONE]\n\n";
    mockStream(text.replaceAll("\n", "\r\n"), true, true);
    const result = await client().chatWithTools([], []);
    expect(result.toolCalls.map((call) => call.id)).toEqual(["a", "b"]);
    expect(JSON.parse(result.toolCalls[1].function.arguments)).toEqual({ path: "目录" });
  });

  it("普通聊天共享相同的提前断流校验", async () => {
    mockStream(delta({ content: "部分内容" }));
    await expect(client().chat([])).rejects.toMatchObject({ kind: "parse" });
  });

  it("流式读取期间取消，终止读取并释放 reader", async () => {
    const controller = new AbortController();
    const { body, cancel } = mockStream(delta({ content: "未完成" }), false);
    const pending = client().chatWithTools([], [], { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
    expect(body.locked).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });

  it("请求级超时覆盖 SSE 正文读取", async () => {
    mockStream(delta({ content: "部分内容" }), false);
    const llm = createLLMClient({
      baseUrl: "https://example.invalid",
      apiKey: "test",
      enableThinking: true,
      onThinking() {},
      timeoutMs: 5,
    });
    await expect(llm.chatWithTools([], [])).rejects.toMatchObject({ kind: "timeout" });
  });

  it("非流式响应拒绝截断工具调用", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ choices: [{ finish_reason: "length", message: { content: "截断" } }] }),
        ),
    );
    const llm = createLLMClient({ baseUrl: "https://example.invalid", apiKey: "test" });
    await expect(llm.chatWithTools([], [])).rejects.toMatchObject({ kind: "parse" });
  });

  it("JSON 修复重试继承取消信号", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation(async () => {
      controller.abort();
      return Response.json({ choices: [{ message: { content: "不是 JSON" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const llm = createLLMClient({ baseUrl: "https://example.invalid", apiKey: "test" });
    await expect(llm.chatJson([], { signal: controller.signal })).rejects.toMatchObject({
      kind: "cancelled",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("EOF 处没有换行的完成标记也能正确消费", async () => {
    mockStream(delta({ content: "完成" }) + finish() + "data: [DONE]");
    await expect(client().chatWithTools([], [])).resolves.toEqual({
      content: "完成",
      toolCalls: [],
    });
  });

  it("忽略心跳，合并多行 data 事件", async () => {
    mockStream(
      ': heartbeat\n\nevent: message\ndata: {"choices":\ndata: [{"delta":{"content":"完成"}}]}\n\ndata: [DONE]\n\n',
    );
    await expect(client().chat([])).resolves.toBe("完成");
  });

  it("调用方取消后不发送 HTTP 请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      client().chatWithTools([], [], { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("按阶段开启思考模式（thinkingStages）", () => {
  const sse = (content: string) =>
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n` +
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n` +
    "data: [DONE]\n\n";

  const captureBodies = (respond: () => Response) => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(init?.body as string) as Record<string, unknown>);
        return respond();
      }),
    );
    return bodies;
  };

  it("命中 thinkingStages 的调用走流式思考请求", async () => {
    const bodies = captureBodies(() => new Response(sse("完成")));
    const llm = createLLMClient({
      baseUrl: "https://example.invalid",
      apiKey: "test",
      thinkingStages: ["intent"],
    });
    await expect(llm.chat([{ role: "user", content: "hi" }], { stage: "intent" })).resolves.toBe(
      "完成",
    );
    expect(bodies[0]).toMatchObject({ stream: true, enable_thinking: true });
  });

  it("未命中 thinkingStages 或未带 stage 的调用保持普通非流式请求", async () => {
    const bodies = captureBodies(() =>
      Response.json({ choices: [{ message: { content: "ok" } }] }),
    );
    const llm = createLLMClient({
      baseUrl: "https://example.invalid",
      apiKey: "test",
      thinkingStages: ["intent"],
    });
    await expect(llm.chat([{ role: "user", content: "hi" }], { stage: "explain" })).resolves.toBe(
      "ok",
    );
    await expect(llm.chat([{ role: "user", content: "hi" }])).resolves.toBe("ok");
    for (const body of bodies) {
      expect(body.stream).toBeUndefined();
      expect(body.enable_thinking).toBeUndefined();
    }
  });

  it("enableThinking 全局开关仍生效", async () => {
    const bodies = captureBodies(() => new Response(sse("思考结果")));
    const llm = createLLMClient({
      baseUrl: "https://example.invalid",
      apiKey: "test",
      enableThinking: true,
    });
    await expect(llm.chat([{ role: "user", content: "hi" }], { stage: "explain" })).resolves.toBe(
      "思考结果",
    );
    expect(bodies[0]).toMatchObject({ stream: true, enable_thinking: true });
  });
});
