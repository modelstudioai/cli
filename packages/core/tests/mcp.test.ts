import { httpTransport } from "../src/client/transport.ts";
import { expect, test } from "vite-plus/test";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Identity, Settings } from "../src/index.ts";
import {
  BailianError,
  ExitCode,
  bailianMcpPath,
  bailianMcpSsePath,
  connectBailianMcpWithFallback,
  isStreamableHttpUnsupported,
  isUrlOverrideSseFallbackCandidate,
} from "../src/index.ts";
import {
  McpClient,
  SdkMcpAdapter,
  mapSdkError,
  type SseGetFailure,
} from "../src/client/mcp-sdk.ts";

function testDeps(overrides?: Partial<Settings>): { identity: Identity; settings: Settings } {
  return {
    identity: {
      binName: "bl",
      version: "0.0.0-test",
      npmPackage: "bailian-cli",
      clientName: "bailian-cli",
    },
    settings: {
      output: "json",
      outputExplicit: true,
      timeout: 5,
      watermark: true,
      verbose: false,
      quiet: true,
      dryRun: false,
      telemetry: true,
      ...overrides,
    },
  };
}

/** A valid initialize result the SDK's InitializeResultSchema accepts. */
const INIT_RESULT = {
  protocolVersion: "2024-11-05",
  capabilities: {},
  serverInfo: { name: "test-server", version: "1.0.0" },
};

function jsonRpc(id: number | string, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function jsonResponse(payload: string): Response {
  return new Response(payload, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function parseBody(init?: RequestInit): { id?: number | string; method?: string } {
  return typeof init?.body === "string" ? (JSON.parse(init.body) as never) : {};
}

// ---- Pure helpers (unchanged contract) ----

test("bailianMcp 路径与 isStreamableHttpUnsupported", () => {
  expect(bailianMcpPath("WebParser")).toBe("/api/v1/mcps/WebParser/mcp");
  expect(bailianMcpSsePath("WebParser")).toBe("/api/v1/mcps/WebParser/sse");

  expect(
    isStreamableHttpUnsupported(
      new BailianError(
        "MCP request failed: 405 Method Not Allowed - current mcp not support streamableHttp",
      ),
    ),
  ).toBe(true);
  expect(
    isStreamableHttpUnsupported(new BailianError("MCP request failed: 405 Method Not Allowed")),
  ).toBe(true);
  expect(isStreamableHttpUnsupported(new BailianError("MCP request failed: 404 Not Found"))).toBe(
    false,
  );
  expect(isStreamableHttpUnsupported(new Error("405 streamableHttp"))).toBe(false);
  // JSON-RPC business 405 must not trigger HTTP transport fallback
  expect(isStreamableHttpUnsupported(new BailianError("MCP error (405): Method Not Allowed"))).toBe(
    false,
  );
  // Nested wrapper phrase in a JSON-RPC message must not trigger fallback.
  expect(
    isStreamableHttpUnsupported(
      new BailianError("MCP error (-32000): MCP request failed: 405 Method Not Allowed"),
    ),
  ).toBe(false);

  expect(
    isUrlOverrideSseFallbackCandidate(new BailianError("MCP request failed: 404 Not Found")),
  ).toBe(true);
  expect(
    isUrlOverrideSseFallbackCandidate(
      new BailianError("MCP request failed: 405 Method Not Allowed"),
    ),
  ).toBe(true);
  expect(isUrlOverrideSseFallbackCandidate(new BailianError("MCP error (404): not found"))).toBe(
    false,
  );
  expect(
    isUrlOverrideSseFallbackCandidate(
      new BailianError("MCP error (-32000): MCP request failed: 404 Not Found"),
    ),
  ).toBe(false);
});

// ---- mapSdkError ----

test("mapSdkError：McpError 默认按 GENERAL 透传；localCloseFired 才将 ConnectionClosed 映射为 NETWORK", () => {
  // SDK-local RequestTimeout is now handled by the adapter's own timer and
  // reaches mapSdkError as a BailianError; a bare McpError is server-authored.
  const timeout = mapSdkError(new McpError(ErrorCode.RequestTimeout, "Request timed out"));
  expect(timeout).toBeInstanceOf(BailianError);
  expect((timeout as BailianError).exitCode).toBe(ExitCode.GENERAL);

  // ConnectionClosed without the local-close signal is treated as a server
  // JSON-RPC error (e.g. the server returned -32000).
  const closed = mapSdkError(new McpError(ErrorCode.ConnectionClosed, "Connection closed"));
  expect(closed).toBeInstanceOf(BailianError);
  expect((closed as BailianError).exitCode).toBe(ExitCode.GENERAL);

  // ConnectionClosed after the local transport closed is a network event.
  const localClosed = mapSdkError(
    new McpError(ErrorCode.ConnectionClosed, "Connection closed"),
    undefined,
    { localCloseFired: true },
  );
  expect(localClosed).toBeInstanceOf(BailianError);
  expect((localClosed as BailianError).exitCode).toBe(ExitCode.NETWORK);

  // Server-side JSON-RPC error: passthrough message with the MCP error shape.
  const business = mapSdkError(new McpError(-32601, "Method not found"));
  expect(business).toBeInstanceOf(BailianError);
  expect((business as BailianError).exitCode).toBe(ExitCode.GENERAL);
  expect((business as BailianError).message).toBe("MCP error (-32601): Method not found");

  // StreamableHTTPError carries the HTTP status in .code.
  const http = mapSdkError(new StreamableHTTPError(503, "Service Unavailable"));
  expect(http).toBeInstanceOf(BailianError);
  expect((http as BailianError).message).toBe("MCP request failed: 503");
  expect((http as BailianError).api?.httpStatus).toBe(503);

  // Already-mapped and native errors pass through by identity.
  const original = new BailianError("boom", ExitCode.AUTH);
  expect(mapSdkError(original)).toBe(original);
  const typeError = new TypeError("fetch failed");
  expect(mapSdkError(typeError)).toBe(typeError);
});

test("mapSdkError：服务端 JSON-RPC 错复用 -32000/-32001 按 GENERAL 透传，不再推断本地签名", () => {
  // Server-authored messages on the locally-interpreted codes must stay GENERAL
  // (exit 1) so callers do not retry business errors as network/timeout.
  const serverClosed = mapSdkError(new McpError(-32000, "session expired"));
  expect(serverClosed).toBeInstanceOf(BailianError);
  expect((serverClosed as BailianError).exitCode).toBe(ExitCode.GENERAL);
  expect((serverClosed as BailianError).message).toBe("MCP error (-32000): session expired");

  // The server can also return -32001 with data.timeout — this must not be
  // mistaken for the SDK's local request timer.
  const serverTimeout = mapSdkError(
    new McpError(-32001, "backend execution expired", { timeout: 5000 }),
  );
  expect((serverTimeout as BailianError).exitCode).toBe(ExitCode.GENERAL);
  expect((serverTimeout as BailianError).message).toBe(
    "MCP error (-32001): backend execution expired",
  );
});

test("mapSdkError：SseError 结合捕获的 SSE GET 失败重建文案契约；无捕获时原样返回", () => {
  const sseError = new SseError(404, "Non-200 status code (404)", {} as never);
  const failure: SseGetFailure = {
    status: 404,
    statusText: "Not Found",
    body: "MCP不存在或未开通",
  };
  const mapped = mapSdkError(sseError, failure);
  expect(mapped).toBeInstanceOf(BailianError);
  expect((mapped as BailianError).message).toBe(
    "MCP request failed: 404 Not Found - MCP不存在或未开通",
  );
  expect((mapped as BailianError).exitCode).toBe(ExitCode.GENERAL);
  expect((mapped as BailianError).api?.httpStatus).toBe(404);

  // Status mismatch (stale capture) and missing capture pass through untouched.
  const stale = mapSdkError(sseError, { status: 500, statusText: "", body: "x" });
  expect(stale).toBe(sseError);
  expect(mapSdkError(sseError)).toBe(sseError);
});

// ---- SdkMcpAdapter (streamable) ----

test("SdkMcpAdapter：注入 Authorization / User-Agent / 追踪头，并发送 clientInfo", async () => {
  const originalFetch = httpTransport.fetch;
  const seenHeaders: Headers[] = [];
  const bodies: Array<{ method?: string; params?: { clientInfo?: unknown } }> = [];

  httpTransport.fetch = async (_input, init) => {
    seenHeaders.push(new Headers(init?.headers));
    const body = parseBody(init);
    bodies.push(body as never);
    if (body.method === "initialize") {
      return jsonResponse(jsonRpc(body.id!, INIT_RESULT));
    }
    return new Response(null, { status: 200 });
  };

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps(),
      url: "https://example.test/api/v1/mcps/WebParser/mcp",
      authToken: "sk-test",
      transport: "streamable",
    });
    await adapter.initialize();

    expect(seenHeaders.length).toBeGreaterThan(0);
    for (const headers of seenHeaders) {
      expect(headers.get("Authorization")).toBe("Bearer sk-test");
      expect(headers.get("User-Agent")).toBe("bailian-cli/0.0.0-test");
      expect(headers.get("X-Dashscope-Service")).toBe("bailian-cli");
      expect(headers.get("x-dashscope-openapisource")).toBe("BailianCLI");
    }
    expect(bodies[0]).toMatchObject({
      method: "initialize",
      params: { clientInfo: { name: "bailian-cli", version: "0.0.0-test" } },
    });
    adapter.close();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：serviceSource 覆写 X-Dashscope-Service（AIGC auto → bailian-cli-call）", async () => {
  const originalFetch = httpTransport.fetch;
  const seenHeaders: Headers[] = [];

  httpTransport.fetch = async (_input, init) => {
    seenHeaders.push(new Headers(init?.headers));
    const body = parseBody(init);
    if (body.method === "initialize") {
      return jsonResponse(jsonRpc(body.id!, INIT_RESULT));
    }
    return new Response(null, { status: 200 });
  };

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps(),
      url: "https://example.test/api/v1/mcps/TextGenerateImage/mcp",
      authToken: "sk-test",
      transport: "streamable",
      serviceSource: "bailian-cli-call",
    });
    await adapter.initialize();

    expect(seenHeaders.length).toBeGreaterThan(0);
    for (const headers of seenHeaders) {
      // 只有 X-Dashscope-Service 被覆写为来源标识；其余渠道标识保持不变。
      expect(headers.get("X-Dashscope-Service")).toBe("bailian-cli-call");
      expect(headers.get("x-dashscope-openapisource")).toBe("BailianCLI");
      expect(headers.get("x-dashscope-source-config")).toContain('"channel":"bailian-cli"');
    }
    adapter.close();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：握手挂死时整体超时为 TIMEOUT 并清理状态可重试", async () => {
  const originalFetch = httpTransport.fetch;
  let calls = 0;
  // 挂死：不 resolve 也不 reject，模拟服务端吞掉 initialize POST。
  httpTransport.fetch = () => {
    calls += 1;
    return new Promise<Response>(() => undefined);
  };

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps({ timeout: 1 }),
      url: "https://example.test/api/v1/mcps/WebParser/mcp",
      authToken: "sk-test",
      transport: "streamable",
    });
    const firstError = await adapter.initialize().catch((caught) => caught);
    expect(firstError).toBeInstanceOf(BailianError);
    expect((firstError as BailianError).exitCode).toBe(ExitCode.TIMEOUT);
    expect((firstError as BailianError).message).toContain("handshake timed out");
    expect(calls).toBeGreaterThan(0);

    // 失败后状态已清理：再次 initialize() 重新发起握手，而非复用挂死的 promise。
    const secondError = await adapter.initialize().catch((caught) => caught);
    expect((secondError as BailianError).exitCode).toBe(ExitCode.TIMEOUT);
    expect(calls).toBeGreaterThan(1);
    adapter.close();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：握手期间 close() abort 在途请求并使 initialize 结束", async () => {
  const originalFetch = httpTransport.fetch;
  const signals: Array<AbortSignal | null | undefined> = [];

  httpTransport.fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      signals.push(init?.signal);
      init?.signal?.addEventListener("abort", () => reject(new Error("fetch aborted")), {
        once: true,
      });
    });

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps({ timeout: 30 }),
      url: "https://example.test/api/v1/mcps/WebParser/mcp",
      authToken: "sk-test",
      transport: "streamable",
    });
    const pending = adapter.initialize();
    // 等待首个请求进入 fetch 拦截器。
    for (let tick = 0; tick < 50 && signals.length === 0; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(signals.length).toBeGreaterThan(0);

    adapter.close();

    const error = await pending.catch((caught) => caught);
    // close() 使 SDK 以 ConnectionClosed 拒绝挂起的握手请求，映射为 NETWORK。
    expect(error).toBeInstanceOf(BailianError);
    expect((error as BailianError).exitCode).toBe(ExitCode.NETWORK);
    expect(signals.some((signal) => signal?.aborted)).toBe(true);
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：无 token 时 initialize 抛 AUTH（不发请求）", async () => {
  const originalFetch = httpTransport.fetch;
  let called = false;
  httpTransport.fetch = async () => {
    called = true;
    return new Response(null, { status: 200 });
  };

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps(),
      url: "https://example.test/mcp",
      authToken: undefined,
      transport: "streamable",
    });
    await expect(adapter.initialize()).rejects.toMatchObject({ exitCode: ExitCode.AUTH });
    expect(called).toBe(false);
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：listTools 与 callTool 结果映射回 McpTool / McpToolResult 形状", async () => {
  const originalFetch = httpTransport.fetch;

  httpTransport.fetch = async (_input, init) => {
    const body = parseBody(init);
    if (body.method === "initialize") {
      return jsonResponse(jsonRpc(body.id!, INIT_RESULT));
    }
    if (body.method === "tools/list") {
      return jsonResponse(
        jsonRpc(body.id!, {
          tools: [
            {
              name: "bailian_image_gen",
              title: "图片生成",
              description: "生成图片",
              inputSchema: { type: "object", properties: {}, required: ["prompt"] },
              outputSchema: { type: "object", properties: {} },
              annotations: { readOnlyHint: true },
              _meta: { "biz/source": "probe" },
            },
          ],
        }),
      );
    }
    if (body.method === "tools/call") {
      return jsonResponse(
        jsonRpc(body.id!, {
          content: [
            { type: "text", text: JSON.stringify({ results: ["https://x/y.png"] }) },
            { type: "image", data: "AAAA", mimeType: "image/png" },
          ],
          // The listed tool declares an outputSchema, so the SDK client
          // validates that the call result carries structuredContent.
          structuredContent: { results: ["https://x/y.png"] },
          isError: false,
        }),
      );
    }
    return new Response(null, { status: 200 });
  };

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps(),
      url: "https://example.test/mcp",
      authToken: "sk-test",
      transport: "streamable",
    });
    await adapter.initialize();

    const tools = await adapter.listTools();
    expect(tools).toEqual([
      {
        name: "bailian_image_gen",
        title: "图片生成",
        description: "生成图片",
        inputSchema: { type: "object", properties: {}, required: ["prompt"] },
        outputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        _meta: { "biz/source": "probe" },
      },
    ]);

    const result = await adapter.callTool("bailian_image_gen", { prompt: "a red dot" });
    expect(result.isError).toBe(false);
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ results: ["https://x/y.png"] }),
    });
    expect(result.content[1]).toEqual({ type: "image", data: "AAAA", mimeType: "image/png" });
    adapter.close();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：callTool 原样保留 resource / resource_link 与 structuredContent", async () => {
  const originalFetch = httpTransport.fetch;

  httpTransport.fetch = async (_input, init) => {
    const body = parseBody(init);
    if (body.method === "initialize") {
      return jsonResponse(jsonRpc(body.id!, INIT_RESULT));
    }
    if (body.method === "tools/call") {
      return jsonResponse(
        jsonRpc(body.id!, {
          content: [
            { type: "text", text: "summary" },
            { type: "resource_link", uri: "https://x/doc", name: "doc", title: "Doc" },
            {
              type: "resource",
              resource: { uri: "https://x/r", mimeType: "text/plain", text: "body" },
            },
          ],
          structuredContent: { total: 1 },
          isError: false,
        }),
      );
    }
    return new Response(null, { status: 200 });
  };

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps(),
      url: "https://example.test/mcp",
      authToken: "sk-test",
      transport: "streamable",
    });
    await adapter.initialize();

    const result = await adapter.callTool("some_tool", {});
    expect(result.content).toEqual([
      { type: "text", text: "summary" },
      { type: "resource_link", uri: "https://x/doc", name: "doc", title: "Doc" },
      {
        type: "resource",
        resource: { uri: "https://x/r", mimeType: "text/plain", text: "body" },
      },
    ]);
    expect(result.structuredContent).toEqual({ total: 1 });
    expect(result.isError).toBe(false);
    adapter.close();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：同源 307 重定向交给 SDK 跟随并完成握手", async () => {
  const originalFetch = httpTransport.fetch;
  const seenUrls: string[] = [];

  httpTransport.fetch = async (input, init) => {
    const url = requestUrl(input);
    seenUrls.push(url);
    const body = parseBody(init);
    if (url.endsWith("/mcp2")) {
      if (body.method === "initialize") {
        return jsonResponse(jsonRpc(body.id!, INIT_RESULT));
      }
      return new Response(null, { status: 202 });
    }
    // /mcp：同源 307 到 /mcp2，由 SDK 的同源重定向策略跟随。
    return new Response(null, {
      status: 307,
      headers: { Location: "https://example.test/mcp2" },
    });
  };

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps(),
      url: "https://example.test/mcp",
      authToken: "sk-test",
      transport: "streamable",
    });
    await adapter.initialize();

    expect(seenUrls).toContain("https://example.test/mcp");
    expect(seenUrls).toContain("https://example.test/mcp2");
    adapter.close();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：跨源 307 不被跟随，保留 `MCP request failed: <status>` 文案", async () => {
  const originalFetch = httpTransport.fetch;

  httpTransport.fetch = async () =>
    new Response(null, {
      status: 307,
      headers: { Location: "https://other.test/mcp" },
    });

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps(),
      url: "https://example.test/mcp",
      authToken: "sk-test",
      transport: "streamable",
    });
    const error = await adapter.initialize().catch((caught) => caught);

    expect(error).toBeInstanceOf(BailianError);
    expect((error as BailianError).message).toMatch(/^MCP request failed: 307/);
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("McpClient 兼容导出：原构造签名委托 SdkMcpAdapter 完成调用", async () => {
  const originalFetch = httpTransport.fetch;

  httpTransport.fetch = async (_input, init) => {
    const body = parseBody(init);
    if (body.method === "initialize") {
      return jsonResponse(jsonRpc(body.id!, INIT_RESULT));
    }
    if (body.method === "tools/call") {
      return jsonResponse(jsonRpc(body.id!, { content: [{ type: "text", text: "hi" }] }));
    }
    return new Response(null, { status: 200 });
  };

  try {
    const client = new McpClient(testDeps(), "https://example.test/mcp", "sk-test");
    await client.initialize();
    const result = await client.callTool("some_tool", {});
    expect(result.content[0]).toEqual({ type: "text", text: "hi" });
    client.close();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：HTTP 4xx POST 复刻 `MCP request failed: <status> - <body>` 文案契约", async () => {
  const originalFetch = httpTransport.fetch;

  httpTransport.fetch = async () =>
    new Response("MCP不存在或未开通", { status: 404, statusText: "Not Found" });

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps(),
      url: "https://example.test/mcp",
      authToken: "sk-test",
      transport: "streamable",
    });
    const error = await adapter.initialize().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(BailianError);
    expect((error as BailianError).message).toMatch(/^MCP request failed:\s*404\b/);
    expect((error as BailianError).message).toContain("MCP不存在或未开通");
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：经典 SSE GET 4xx 保留状态码与服务端正文（开通判定契约）", async () => {
  const originalFetch = httpTransport.fetch;

  httpTransport.fetch = async () =>
    new Response("MCP_IS_INVALID", { status: 404, statusText: "Not Found" });

  try {
    const adapter = new SdkMcpAdapter({
      deps: testDeps(),
      url: "https://example.test/sse",
      authToken: "sk-test",
      transport: "sse",
    });
    const error = await adapter.initialize().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(BailianError);
    expect((error as BailianError).message).toMatch(/^MCP request failed:\s*404\b/);
    expect((error as BailianError).message).toContain("MCP_IS_INVALID");
    expect((error as BailianError).api?.httpStatus).toBe(404);
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

// ---- connectBailianMcpWithFallback orchestration ----

test("connectBailianMcpWithFallback：成功走 Streamable", async () => {
  const originalFetch = httpTransport.fetch;
  const urls: string[] = [];

  httpTransport.fetch = async (input, init) => {
    const url = requestUrl(input);
    urls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/sse")) {
      return new Response("should not hit sse", { status: 500 });
    }
    const body = parseBody(init);
    if (body.method === "initialize") {
      return jsonResponse(jsonRpc(body.id!, INIT_RESULT));
    }
    return new Response(null, { status: 200 });
  };

  try {
    const connected = await connectBailianMcpWithFallback({
      deps: testDeps(),
      authToken: "sk-test",
      httpUrl: "https://example.test/api/v1/mcps/WebParser/mcp",
      sseUrl: "https://example.test/api/v1/mcps/WebParser/sse",
      serverCode: "WebParser",
    });
    expect(connected.url).toContain("/mcp");
    expect(urls.some((entry) => entry.includes("/sse"))).toBe(false);
    connected.client.close?.();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：WebSearch 405 不降级、抛 BailianError、不触达 /sse", async () => {
  const originalFetch = httpTransport.fetch;
  const urls: string[] = [];

  httpTransport.fetch = async (input) => {
    urls.push(requestUrl(input));
    return new Response("current mcp not support streamableHttp", {
      status: 405,
      statusText: "Method Not Allowed",
    });
  };

  try {
    await expect(
      connectBailianMcpWithFallback({
        deps: testDeps(),
        authToken: "sk-test",
        httpUrl: "https://example.test/api/v1/mcps/WebSearch/mcp",
        sseUrl: "https://example.test/api/v1/mcps/WebSearch/sse",
        serverCode: "WebSearch",
      }),
    ).rejects.toBeInstanceOf(BailianError);
    expect(urls.some((url) => url.includes("/sse"))).toBe(false);
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：Bailian 路径 404 不降级，错误含 404", async () => {
  const originalFetch = httpTransport.fetch;
  const urls: string[] = [];

  httpTransport.fetch = async (input) => {
    urls.push(requestUrl(input));
    return new Response("MCP不存在或未开通", { status: 404, statusText: "Not Found" });
  };

  try {
    await expect(
      connectBailianMcpWithFallback({
        deps: testDeps(),
        authToken: "sk-test",
        httpUrl: "https://example.test/api/v1/mcps/WebParser/mcp",
        sseUrl: "https://example.test/api/v1/mcps/WebParser/sse",
        serverCode: "WebParser",
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("404") });
    expect(urls.some((url) => url.includes("/sse"))).toBe(false);
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：405 降级到经典 SSE 并连接成功", async () => {
  const originalFetch = httpTransport.fetch;
  const urls: string[] = [];
  const encoder = new TextEncoder();
  let sseController: ReadableStreamDefaultController<Uint8Array> | undefined;

  httpTransport.fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    urls.push(`${method} ${url}`);

    if (url.endsWith("/mcp")) {
      return new Response("Method Not Allowed", { status: 405, statusText: "Method Not Allowed" });
    }
    if (url.endsWith("/sse") && method === "GET") {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          sseController = controller;
          controller.enqueue(
            encoder.encode("event: endpoint\ndata: /api/v1/mcps/WebParser/message?sessionId=s\n\n"),
          );
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    if (url.includes("/message")) {
      const body = parseBody(init);
      if (body.id != null) {
        const result = body.method === "initialize" ? INIT_RESULT : {};
        queueMicrotask(() => {
          sseController?.enqueue(
            encoder.encode(`event: message\ndata: ${jsonRpc(body.id!, result)}\n\n`),
          );
        });
      }
      return new Response(null, { status: 202 });
    }
    return new Response("unexpected", { status: 500 });
  };

  try {
    const connected = await connectBailianMcpWithFallback({
      deps: testDeps(),
      authToken: "sk-test",
      httpUrl: "https://example.test/api/v1/mcps/WebParser/mcp",
      sseUrl: "https://example.test/api/v1/mcps/WebParser/sse",
      serverCode: "WebParser",
    });
    expect(connected.url).toContain("/sse");
    expect(urls.some((entry) => entry.startsWith("GET ") && entry.includes("/sse"))).toBe(true);
    connected.client.close?.();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：405 降级后经典 SSE GET 4xx 仍保留正文（开通提示契约）", async () => {
  const originalFetch = httpTransport.fetch;
  const urls: string[] = [];

  httpTransport.fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    urls.push(`${method} ${url}`);
    if (url.endsWith("/mcp")) {
      return new Response("Method Not Allowed", { status: 405, statusText: "Method Not Allowed" });
    }
    return new Response("MCP不存在或未开通", { status: 404, statusText: "Not Found" });
  };

  try {
    const error = await connectBailianMcpWithFallback({
      deps: testDeps(),
      authToken: "sk-test",
      httpUrl: "https://example.test/api/v1/mcps/WebParser/mcp",
      sseUrl: "https://example.test/api/v1/mcps/WebParser/sse",
      serverCode: "WebParser",
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(BailianError);
    expect((error as BailianError).message).toMatch(/^MCP request failed:\s*404\b/);
    expect((error as BailianError).message).toContain("MCP不存在或未开通");
    expect(urls.some((entry) => entry.startsWith("GET ") && entry.includes("/sse"))).toBe(true);
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：--url 覆盖，POST 405 后同 URL GET SSE 降级", async () => {
  const originalFetch = httpTransport.fetch;
  const urls: string[] = [];
  const encoder = new TextEncoder();
  const overrideUrl = "https://custom.example/mcp";
  let sseController: ReadableStreamDefaultController<Uint8Array> | undefined;

  httpTransport.fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    urls.push(`${method} ${url}`);

    if (method === "POST" && url === overrideUrl) {
      return new Response("Method Not Allowed", { status: 405, statusText: "Method Not Allowed" });
    }
    if (method === "GET" && url === overrideUrl) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          sseController = controller;
          controller.enqueue(encoder.encode("event: endpoint\ndata: /message?sessionId=x\n\n"));
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    if (url.includes("/message")) {
      const body = parseBody(init);
      if (body.id != null) {
        const result = body.method === "initialize" ? INIT_RESULT : {};
        queueMicrotask(() => {
          sseController?.enqueue(
            encoder.encode(`event: message\ndata: ${jsonRpc(body.id!, result)}\n\n`),
          );
        });
      }
      return new Response(null, { status: 202 });
    }
    return new Response("unexpected", { status: 500 });
  };

  try {
    const connected = await connectBailianMcpWithFallback({
      deps: testDeps(),
      authToken: "sk-test",
      httpUrl: "https://example.test/api/v1/mcps/WebParser/mcp",
      sseUrl: "https://example.test/api/v1/mcps/WebParser/sse",
      serverCode: "WebParser",
      urlOverride: overrideUrl,
    });
    expect(connected.url).toBe(overrideUrl);
    expect(urls.some((entry) => entry.startsWith(`GET ${overrideUrl}`))).toBe(true);
    connected.client.close?.();
  } finally {
    httpTransport.fetch = originalFetch;
  }
});
