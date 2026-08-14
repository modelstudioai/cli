import { expect, test } from "vite-plus/test";
import type { Identity, Settings } from "../src/index.ts";
import {
  BailianError,
  bailianMcpPath,
  bailianMcpSsePath,
  connectBailianMcpWithFallback,
  isStreamableHttpUnsupported,
  isUrlOverrideSseFallbackCandidate,
  McpClient,
} from "../src/index.ts";
import { McpSseClient, resolveSameOriginMessageUrl } from "../src/client/mcp-sse.ts";

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
      verbose: false,
      quiet: true,
      dryRun: false,
      telemetry: true,
      ...overrides,
    },
  };
}

function jsonRpcResult(id: number | string, result: unknown): string {
  return `event:message\ndata:${JSON.stringify({ jsonrpc: "2.0", id, result })}\n\n`;
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

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

test("resolveSameOriginMessageUrl：同源通过、跨域拒绝", () => {
  expect(
    resolveSameOriginMessageUrl(
      "https://example.test/api/v1/mcps/WebParser/sse",
      "/api/v1/mcps/WebParser/message?sessionId=x",
    ),
  ).toBe("https://example.test/api/v1/mcps/WebParser/message?sessionId=x");

  expect(() =>
    resolveSameOriginMessageUrl(
      "https://example.test/api/v1/mcps/WebParser/sse",
      "https://evil.example/steal",
    ),
  ).toThrow(/origin mismatch/i);
});

test("connectBailianMcpWithFallback：成功走 Streamable；405 降级 SSE", async () => {
  const originalFetch = globalThis.fetch;

  // Streamable success path
  globalThis.fetch = async (input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (requestUrl(input).includes("/sse")) {
      return new Response("should not hit sse", { status: 500 });
    }
    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 200 });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), {
      status: 200,
    });
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
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Bare HTTP 405 (no streamableHttp body text) → SSE
  let sseController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  const urls: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    urls.push(`${init?.method ?? "GET"} ${url}`);

    if (url.endsWith("/mcp")) {
      return new Response("Method Not Allowed", {
        status: 405,
        statusText: "Method Not Allowed",
      });
    }

    if (url.endsWith("/sse") && (init?.method ?? "GET") === "GET") {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          sseController = controller;
          controller.enqueue(
            encoder.encode(
              "event:endpoint\ndata:/api/v1/mcps/WebParser/message?sessionId=test-session\n\n",
            ),
          );
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    if (url.includes("/message")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      queueMicrotask(() => {
        if (body.id != null && sseController) {
          sseController.enqueue(encoder.encode(jsonRpcResult(body.id, {})));
        }
      });
      return new Response(null, { status: 200 });
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
    expect(urls.some((entry) => entry.includes("GET ") && entry.includes("/sse"))).toBe(true);
    connected.client.close?.();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("connectBailianMcpWithFallback：WebSearch 不降级；urlOverride 同 URL 降级 SSE；404 不降级 Bailian 路径", async () => {
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

  // urlOverride: after POST 405, fall back with GET SSE on the same URL
  urls.length = 0;
  let sseController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  const overrideUrl = "https://custom.example/mcp";

  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    urls.push(`${method} ${url}`);

    if (method === "POST" && url === overrideUrl) {
      return new Response("Method Not Allowed", {
        status: 405,
        statusText: "Method Not Allowed",
      });
    }

    if (method === "GET" && url === overrideUrl) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          sseController = controller;
          controller.enqueue(encoder.encode("event:endpoint\ndata:/message?sessionId=x\n\n"));
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    if (url.includes("/message")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      queueMicrotask(() => {
        if (body.id != null && sseController) {
          sseController.enqueue(encoder.encode(jsonRpcResult(body.id, {})));
        }
      });
      return new Response(null, { status: 200 });
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

  globalThis.fetch = async () =>
    new Response("MCP不存在或未开通", { status: 404, statusText: "Not Found" });

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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient：流结束后立刻失败 pending（不干等到 timeout）", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();

  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if ((init?.method ?? "GET") === "GET" || url.endsWith("/sse")) {
      // Close the stream immediately after the endpoint event
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode("event:endpoint\ndata:/api/v1/mcps/WebParser/message?sessionId=x\n\n"),
          );
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    return new Response(null, { status: 200 });
  };

  try {
    const client = new McpSseClient(
      testDeps({ timeout: 5 }),
      "https://example.test/sse",
      "sk-test",
    );
    const started = Date.now();
    await expect(client.initialize()).rejects.toThrow(/stream ended unexpectedly/i);
    expect(Date.now() - started).toBeLessThan(2000);
    client.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient：string JSON-RPC id 可匹配；仅认 event:endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let sseController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();

  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if ((init?.method ?? "GET") === "GET" || url.endsWith("/sse")) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          sseController = controller;
          // Untyped events must not be treated as endpoint
          controller.enqueue(
            encoder.encode(`data:${JSON.stringify({ jsonrpc: "2.0", id: 99, result: {} })}\n\n`),
          );
          controller.enqueue(
            encoder.encode("event:endpoint\ndata:/api/v1/mcps/WebParser/message?sessionId=x\n\n"),
          );
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    if (url.includes("/message")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      queueMicrotask(() => {
        if (body.id != null && sseController) {
          // Echo id as a string
          sseController.enqueue(encoder.encode(jsonRpcResult(String(body.id), {})));
        }
      });
      return new Response(null, { status: 200 });
    }

    return new Response("unexpected", { status: 500 });
  };

  try {
    const client = new McpSseClient(testDeps(), "https://example.test/sse", "sk-test");
    await client.initialize();
    client.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpClient：支持 text/event-stream 响应体", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    const sse = `event: message\ndata: ${JSON.stringify({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        serverInfo: { name: "x", version: "0" },
      },
    })}\n\n`;
    return new Response(sse, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };

  try {
    const client = new McpClient(testDeps(), "https://example.test/mcp", "sk-test");
    await client.initialize();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient.close 可中止挂起 GET", async () => {
  const originalFetch = globalThis.fetch;
  let aborted = false;

  globalThis.fetch = async (_input, init) => {
    const signal = init?.signal;
    if (signal) {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            "event:endpoint\ndata:/api/v1/mcps/WebParser/message?sessionId=x\n\n",
          ),
        );
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };

  try {
    const client = new McpSseClient(testDeps(), "https://example.test/sse", "sk-test");
    const initPromise = client.initialize().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    client.close();
    await initPromise;
    expect(aborted).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient：等待响应头受 --timeout 约束", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init) => {
    const signal = init?.signal;
    return new Promise((_resolve, reject) => {
      if (!signal) {
        reject(new Error("missing signal"));
        return;
      }
      if (signal.aborted) {
        reject(new DOMException("This operation was aborted.", "AbortError"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("This operation was aborted.", "AbortError")),
        { once: true },
      );
    });
  };

  try {
    const client = new McpSseClient(
      testDeps({ timeout: 1 }),
      "https://example.test/sse",
      "sk-test",
    );
    const started = Date.now();
    await expect(client.initialize()).rejects.toThrow(/timed out waiting for response headers/i);
    expect(Date.now() - started).toBeLessThan(2500);
    client.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient：非 2xx 不产生 unhandledRejection", async () => {
  const originalFetch = globalThis.fetch;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);

  globalThis.fetch = async () =>
    new Response("boom", { status: 500, statusText: "Internal Server Error" });

  try {
    const client = new McpSseClient(testDeps(), "https://example.test/sse", "sk-test");
    await expect(client.initialize()).rejects.toThrow(/MCP request failed:\s*500/i);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(unhandled).toEqual([]);
    client.close();
  } finally {
    process.off("unhandledRejection", onUnhandled);
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient：非 2xx 读 body 仍受 --timeout 约束", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init) => {
    const signal = init?.signal;
    return {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      async text() {
        return new Promise<string>((_resolve, reject) => {
          if (!signal) {
            reject(new Error("missing signal"));
            return;
          }
          if (signal.aborted) {
            reject(new DOMException("This operation was aborted.", "AbortError"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("This operation was aborted.", "AbortError")),
            { once: true },
          );
        });
      },
    } as Response;
  };

  try {
    const client = new McpSseClient(
      testDeps({ timeout: 1 }),
      "https://example.test/sse",
      "sk-test",
    );
    const started = Date.now();
    await expect(client.initialize()).rejects.toThrow(/timed out reading error response body/i);
    expect(Date.now() - started).toBeLessThan(2500);
    client.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient：fetch 失败抛出原始 TypeError（保留 ENOTFOUND）", async () => {
  const originalFetch = globalThis.fetch;
  const root = Object.assign(new Error("getaddrinfo ENOTFOUND example.test"), {
    code: "ENOTFOUND",
  });
  const fetchFailed = new TypeError("fetch failed", { cause: root });

  globalThis.fetch = async () => {
    throw fetchFailed;
  };

  try {
    const client = new McpSseClient(testDeps(), "https://example.test/sse", "sk-test");
    const error = await client.initialize().catch((reason: unknown) => reason);
    expect(error).toBe(fetchFailed);
    expect((error as TypeError & { cause?: NodeJS.ErrnoException }).cause?.code).toBe("ENOTFOUND");
    client.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient：fetch 失败后同实例可重新 openSse", async () => {
  const originalFetch = globalThis.fetch;
  let attempt = 0;
  let sseController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();

  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    if (method === "GET" || url.endsWith("/sse")) {
      attempt += 1;
      if (attempt === 1) {
        throw new TypeError("fetch failed");
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          sseController = controller;
          controller.enqueue(encoder.encode("event: endpoint\ndata: /message\n\n"));
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    queueMicrotask(() => {
      if (body.id != null && sseController) {
        sseController.enqueue(encoder.encode(jsonRpcResult(body.id, {})));
      }
    });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const client = new McpSseClient(testDeps(), "https://example.test/sse", "sk-test");
    await expect(client.initialize()).rejects.toThrow(/fetch failed/i);
    await client.initialize();
    client.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient：close 可中止进行中的 POST", async () => {
  const originalFetch = globalThis.fetch;
  let postAborted = false;
  const encoder = new TextEncoder();

  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    if (method === "GET" || url.endsWith("/sse")) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("event: endpoint\ndata: /message\n\n"));
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    const signal = init?.signal;
    return new Promise((_resolve, reject) => {
      if (!signal) {
        reject(new Error("missing signal"));
        return;
      }
      const onAbort = () => {
        postAborted = true;
        reject(new DOMException("This operation was aborted.", "AbortError"));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  };

  try {
    const client = new McpSseClient(
      testDeps({ timeout: 5 }),
      "https://example.test/sse",
      "sk-test",
    );
    const initPromise = client.initialize();
    await new Promise((resolve) => setTimeout(resolve, 30));
    client.close();
    await expect(initPromise).rejects.toThrow(/session closed|aborted/i);
    expect(postAborted).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpSseClient：POST 非 2xx 读 body 仍受 --timeout 约束", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();

  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    if (method === "GET" || url.endsWith("/sse")) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("event: endpoint\ndata: /message\n\n"));
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        if (!signal) return;
        const onAbort = () => {
          try {
            controller.error(new DOMException("This operation was aborted.", "AbortError"));
          } catch {
            /* ignore */
          }
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      },
    });
    return new Response(body, { status: 500, statusText: "Internal Server Error" });
  };

  try {
    const client = new McpSseClient(
      testDeps({ timeout: 1 }),
      "https://example.test/sse",
      "sk-test",
    );
    const started = Date.now();
    await expect(client.initialize()).rejects.toThrow(/timed out reading error response body/i);
    expect(Date.now() - started).toBeLessThan(2500);
    client.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
