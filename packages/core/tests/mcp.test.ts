import { expect, test } from "vite-plus/test";
import type { Identity, Settings } from "../src/index.ts";
import {
  BailianError,
  bailianMcpPath,
  bailianMcpSsePath,
  connectBailianMcpWithFallback,
  isStreamableHttpUnsupported,
} from "../src/index.ts";
import { McpSseClient, resolveSameOriginMessageUrl } from "../src/client/mcp-sse.ts";

function testDeps(): { identity: Identity; settings: Settings } {
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
    },
  };
}

function jsonRpcResult(id: number, result: unknown): string {
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
  ).toBe(false);
  expect(isStreamableHttpUnsupported(new Error("405 streamableHttp"))).toBe(false);
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

  // 405 streamableHttp → SSE
  let sseController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  const urls: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    urls.push(`${init?.method ?? "GET"} ${url}`);

    if (url.endsWith("/mcp")) {
      return new Response("current mcp not support streamableHttp", {
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

test("connectBailianMcpWithFallback：WebSearch / urlOverride / 非目标错误不降级", async () => {
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

    urls.length = 0;
    await expect(
      connectBailianMcpWithFallback({
        deps: testDeps(),
        authToken: "sk-test",
        httpUrl: "https://example.test/api/v1/mcps/WebParser/mcp",
        sseUrl: "https://example.test/api/v1/mcps/WebParser/sse",
        serverCode: "WebParser",
        urlOverride: "https://custom.example/mcp",
      }),
    ).rejects.toBeInstanceOf(BailianError);
    expect(urls).toEqual(["https://custom.example/mcp"]);
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
