import { expect, test } from "vite-plus/test";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
import { SdkMcpAdapter, mapSdkError } from "../src/client/mcp-sdk.ts";

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

test("mapSdkError：超时/连接关闭映射 ExitCode；服务端 JSON-RPC 错透传；BailianError 与原生错原样返回", () => {
  const timeout = mapSdkError(new McpError(ErrorCode.RequestTimeout, "Request timed out"));
  expect(timeout).toBeInstanceOf(BailianError);
  expect((timeout as BailianError).exitCode).toBe(ExitCode.TIMEOUT);

  const closed = mapSdkError(new McpError(ErrorCode.ConnectionClosed, "Connection closed"));
  expect(closed).toBeInstanceOf(BailianError);
  expect((closed as BailianError).exitCode).toBe(ExitCode.NETWORK);

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

// ---- SdkMcpAdapter (streamable) ----

test("SdkMcpAdapter：注入 Authorization / User-Agent / 追踪头，并发送 clientInfo", async () => {
  const originalFetch = globalThis.fetch;
  const seenHeaders: Headers[] = [];
  const bodies: Array<{ method?: string; params?: { clientInfo?: unknown } }> = [];

  globalThis.fetch = async (_input, init) => {
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
    globalThis.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：serviceSource 覆写 X-Dashscope-Service（AIGC auto → bailian-cli-call）", async () => {
  const originalFetch = globalThis.fetch;
  const seenHeaders: Headers[] = [];

  globalThis.fetch = async (_input, init) => {
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
    globalThis.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：无 token 时 initialize 抛 AUTH（不发请求）", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
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
    globalThis.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：listTools 与 callTool 结果映射回 McpTool / McpToolResult 形状", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init) => {
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
              description: "生成图片",
              inputSchema: { type: "object", properties: {}, required: ["prompt"] },
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
        description: "生成图片",
        inputSchema: { type: "object", properties: {}, required: ["prompt"] },
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
    globalThis.fetch = originalFetch;
  }
});

test("SdkMcpAdapter：HTTP 4xx POST 复刻 `MCP request failed: <status> - <body>` 文案契约", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
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
    globalThis.fetch = originalFetch;
  }
});

// ---- connectBailianMcpWithFallback orchestration ----

test("connectBailianMcpWithFallback：成功走 Streamable", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  globalThis.fetch = async (input, init) => {
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
    globalThis.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：WebSearch 405 不降级、抛 BailianError、不触达 /sse", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  globalThis.fetch = async (input) => {
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
    globalThis.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：Bailian 路径 404 不降级，错误含 404", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  globalThis.fetch = async (input) => {
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
    globalThis.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：405 降级到经典 SSE 并连接成功", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  const encoder = new TextEncoder();
  let sseController: ReadableStreamDefaultController<Uint8Array> | undefined;

  globalThis.fetch = async (input, init) => {
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
    globalThis.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：--url 覆盖，POST 405 后同 URL GET SSE 降级", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  const encoder = new TextEncoder();
  const overrideUrl = "https://custom.example/mcp";
  let sseController: ReadableStreamDefaultController<Uint8Array> | undefined;

  globalThis.fetch = async (input, init) => {
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
    globalThis.fetch = originalFetch;
  }
});
