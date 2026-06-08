/**
 * MCP (Model Context Protocol) streamable HTTP client.
 *
 * Implements the JSON-RPC 2.0 based MCP protocol over streamable HTTP transport.
 * Used by DashScope MCP services like WebSearch and the Bailian marketplace.
 *
 * Protocol flow: initialize → tools/list → tools/call
 *
 * Auth: always sends `Authorization: Bearer <DashScope sk-key>` resolved via
 * `resolveCredential`. Bailian MCPs all accept this; non-Bailian endpoints
 * are out of scope for this client.
 */

import type { Config } from "../config/schema.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { requireNativeDashScope, resolveCredential } from "../auth/resolver.ts";
import { trackingHeaders } from "./headers.ts";

// ---- JSON-RPC 2.0 Types ----

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
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
export function bailianMcpUrl(baseUrl: string, serverCode: string): string {
  const root = baseUrl.replace(/\/$/, "");
  return `${root}/api/v1/mcps/${serverCode}/mcp`;
}

// ---- MCP Client ----

export class McpClient {
  private url: string;
  private sessionId: string | undefined;
  private nextId = 1;
  private config: Config;
  private authToken: string | undefined;

  constructor(config: Config, url: string) {
    this.config = config;
    this.url = url;
  }

  /** Initialize the MCP session. Must be called before any other method. */
  async initialize(): Promise<void> {
    const credential = await resolveCredential(this.config);
    requireNativeDashScope(credential, "MCP services");
    this.authToken = credential.token;

    const result = await this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: this.config.clientName ?? "bailian-cli-core",
        version: this.config.clientVersion ?? "0.0.0-dev",
      },
    });

    if (this.config.verbose) {
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
    const data = (await response.json()) as JsonRpcResponse;

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

  private async send(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": `${this.config.clientName ?? "bailian-cli-core"}/${this.config.clientVersion ?? "0.0.0-dev"}`,
      ...trackingHeaders(),
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    if (this.config.verbose) {
      console.error(`> POST ${this.url}`);
      console.error(`> Method: ${(body as { method?: string }).method}`);
    }

    const timeoutMs = this.config.timeout * 1000;
    const res = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (this.config.verbose) {
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
