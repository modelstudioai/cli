/**
 * MCP (Model Context Protocol) streamable HTTP client.
 *
 * Implements the JSON-RPC 2.0 based MCP protocol over streamable HTTP transport.
 * Used by DashScope MCP services like WebSearch and the Bailian marketplace.
 *
 * Protocol flow: initialize → tools/list → tools/call
 *
 * Auth: always sends `Authorization: Bearer <DashScope sk-key>` injected by the
 * caller (Client.mcp). Bailian MCPs all accept this; non-Bailian endpoints
 * are out of scope for this client.
 */

import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { HttpDeps } from "./http.ts";
import { trackingHeaders } from "./headers.ts";
import { McpSseClient } from "./mcp-sse.ts";
import { parseSSE } from "./stream.ts";

// ---- JSON-RPC 2.0 Types ----

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ---- MCP Tool Types ----

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ---- Bailian MCP URL convention ----

/**
 * Compose the streamable-HTTP MCP endpoint for a Bailian MCP server.
 * The path is `/api/v1/mcps/<serverCode>/mcp`; the `serverCode` is taken
 * verbatim from `bl mcp list` (e.g. `WebSearch`, `market-cmapi00073529`).
 */
export function bailianMcpPath(serverCode: string): string {
  return `/api/v1/mcps/${serverCode}/mcp`;
}

/** Classic SSE path: `/api/v1/mcps/<serverCode>/sse`. */
export function bailianMcpSsePath(serverCode: string): string {
  return `/api/v1/mcps/${serverCode}/sse`;
}

/**
 * True when Streamable HTTP is unsupported and classic SSE fallback should be tried.
 * 以 HTTP 405 为准，不依赖服务端英文文案（避免文案变更导致降级失效）。
 * Bailian 的 404（未开通）不在此列，避免误降级。
 */
export function isStreamableHttpUnsupported(error: unknown): boolean {
  if (!(error instanceof BailianError)) return false;
  return /405\b/i.test(error.message);
}

/**
 * `--url` 覆盖时的 SSE 降级条件（官方 backwards-compat：同 URL 上 405/404 后尝试 GET SSE）。
 */
export function isUrlOverrideSseFallbackCandidate(error: unknown): boolean {
  if (!(error instanceof BailianError)) return false;
  return /405\b/i.test(error.message) || /404\b/i.test(error.message);
}

export type McpConnectedClient = {
  initialize(): Promise<void>;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  close?(): void;
};

export type ConnectBailianMcpOptions = {
  deps: HttpDeps;
  authToken: string | undefined;
  /** Full Streamable HTTP URL (/mcp). */
  httpUrl: string;
  /** Full classic SSE URL (/sse). */
  sseUrl: string;
  serverCode: string;
  /**
   * Explicit `--url` override: try Streamable on that URL first;
   * on 405/404 fall back to classic SSE on the same URL.
   */
  urlOverride?: string;
};

/**
 * Connect via Streamable HTTP first; on 405 (except WebSearch), fall back to SSE.
 * `--url` uses the same URL for Streamable then classic SSE (official backwards-compat).
 * For WebSearch, rethrow the original error so commands can attach a re-activate hint.
 */
export async function connectBailianMcpWithFallback(
  options: ConnectBailianMcpOptions,
): Promise<{ client: McpConnectedClient; url: string }> {
  const { deps, authToken, httpUrl, sseUrl, serverCode, urlOverride } = options;

  if (urlOverride) {
    const httpClient = new McpClient(deps, urlOverride, authToken);
    try {
      await httpClient.initialize();
      return { client: httpClient, url: urlOverride };
    } catch (error) {
      if (!isUrlOverrideSseFallbackCandidate(error)) {
        throw error;
      }
    }

    const sseClient = new McpSseClient(deps, urlOverride, authToken);
    try {
      await sseClient.initialize();
      return { client: sseClient, url: urlOverride };
    } catch (error) {
      sseClient.close();
      throw error;
    }
  }

  const httpClient = new McpClient(deps, httpUrl, authToken);
  try {
    await httpClient.initialize();
    return { client: httpClient, url: httpUrl };
  } catch (error) {
    if (!isStreamableHttpUnsupported(error) || serverCode === "WebSearch") {
      throw error;
    }
  }

  const sseClient = new McpSseClient(deps, sseUrl, authToken);
  try {
    await sseClient.initialize();
    return { client: sseClient, url: sseUrl };
  } catch (error) {
    sseClient.close();
    throw error;
  }
}

// ---- MCP Client ----

export class McpClient {
  private url: string;
  private sessionId: string | undefined;
  private nextId = 1;
  private deps: HttpDeps;
  private authToken: string | undefined;

  constructor(deps: HttpDeps, url: string, authToken?: string) {
    this.deps = deps;
    this.url = url;
    this.authToken = authToken;
  }

  /** Initialize the MCP session. Must be called before any other method. */
  async initialize(): Promise<void> {
    if (!this.authToken) {
      throw new BailianError("This command needs a model-domain API key.", ExitCode.AUTH);
    }

    const result = await this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: this.deps.identity.clientName,
        version: this.deps.identity.version,
      },
    });

    if (this.deps.settings.verbose) {
      console.error(`[MCP] Session initialized: ${this.sessionId ?? "no session"}`);
      console.error(`[MCP] Server: ${JSON.stringify(result)}`);
    }

    await this.notify("notifications/initialized");
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.rpc("tools/list")) as { tools: McpTool[] };
    return result.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = (await this.rpc("tools/call", { name, arguments: args })) as McpToolResult;
    return result;
  }

  // ---- Internal Methods ----

  private async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    };

    const response = await this.send(body);
    const data = await this.readJsonRpcResponse(response, id);

    if (data.error) {
      throw new BailianError(
        `MCP error (${data.error.code}): ${data.error.message}`,
        ExitCode.GENERAL,
      );
    }

    return data.result;
  }

  private async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const body = {
      jsonrpc: "2.0" as const,
      method,
      ...(params ? { params } : {}),
    };

    await this.send(body);
  }

  /**
   * 按 Content-Type 读取 JSON-RPC 响应：支持 application/json 与 text/event-stream。
   */
  private async readJsonRpcResponse(
    response: Response,
    expectedId: number,
  ): Promise<JsonRpcResponse> {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      return await this.readJsonRpcFromSse(response, expectedId);
    }

    return (await response.json()) as JsonRpcResponse;
  }

  private async readJsonRpcFromSse(
    response: Response,
    expectedId: number,
  ): Promise<JsonRpcResponse> {
    const expectedKey = String(expectedId);
    for await (const event of parseSSE(response)) {
      if (event.event && event.event !== "message") continue;
      let payload: JsonRpcResponse;
      try {
        payload = JSON.parse(event.data) as JsonRpcResponse;
      } catch {
        continue;
      }
      if (payload.id == null) continue;
      if (String(payload.id) !== expectedKey) continue;
      return payload;
    }
    throw new BailianError(
      "MCP SSE response stream ended without a matching JSON-RPC response.",
      ExitCode.GENERAL,
    );
  }

  private async send(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": `${this.deps.identity.clientName}/${this.deps.identity.version}`,
      ...trackingHeaders(this.deps.identity),
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    if (this.deps.settings.verbose) {
      console.error(`> POST ${this.url}`);
      console.error(`> Method: ${(body as { method?: string }).method}`);
    }

    const timeoutMs = this.deps.settings.timeout * 1000;
    const res = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (this.deps.settings.verbose) {
      console.error(`< ${res.status} ${res.statusText}`);
    }

    const sid = res.headers.get("Mcp-Session-Id") || res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    if (!res.ok) {
      let errMsg = `MCP request failed: ${res.status} ${res.statusText}`;
      try {
        const errBody = await res.text();
        if (errBody) errMsg += ` - ${errBody.slice(0, 500)}`;
      } catch {
        /* ignore */
      }
      throw new BailianError(errMsg, ExitCode.GENERAL);
    }

    return res;
  }
}
