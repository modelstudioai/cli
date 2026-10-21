/**
 * MCP client backed by the official `@modelcontextprotocol/sdk` (v1 line).
 *
 * Implements the same {@link McpConnectedClient} surface as the retired
 * hand-rolled JSON-RPC/SSE pipeline, so the three callers (`Client.mcp()`,
 * `connectBailianMcpWithFallback`, and through them `search/web`, `mcp/tools`,
 * `mcp/call`) stay unchanged. All SDK-specific code (imports, transports, error
 * classes) is confined to this file to keep the v1→v2 upgrade path cheap.
 *
 * Wire behaviour preserved from the old client:
 * - Bearer token + tracking headers + User-Agent on every request (via
 *   `requestInit.headers`, which the SDK applies to both GET and POST).
 * - `MCP request failed: <status> <statusText> - <body>` message contract for
 *   HTTP transport failures, which `isStreamableHttpUnsupported`,
 *   `isUrlOverrideSseFallbackCandidate` and the MCP-not-activated hint rely on.
 * - `MCP error (<code>): <message>` for JSON-RPC business errors (passthrough).
 * - Raw `TypeError` (e.g. ENOTFOUND) propagation so runtime can surface errno.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { FetchLike, Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { trackingHeaders } from "./headers.ts";
import type { HttpDeps } from "./http.ts";
import type { McpConnectedClient, McpTool, McpToolResult } from "./mcp.ts";

/** Which transport the adapter drives: Streamable HTTP (/mcp) or classic SSE (/sse). */
export type SdkMcpTransportKind = "streamable" | "sse";

export interface SdkMcpAdapterOptions {
  deps: HttpDeps;
  /** Full endpoint URL for the chosen transport. */
  url: string;
  authToken: string | undefined;
  transport: SdkMcpTransportKind;
  /**
   * Overrides the `X-Dashscope-Service` attribution value (default `bailian-cli`).
   * AIGC "auto"-mode MCP calls pass `bailian-cli-call`.
   */
  serviceSource?: string;
}

/**
 * Translate an SDK/transport error into the CLI error contract.
 *
 * - `BailianError` (already ours, produced by the fetch interceptor) passes through.
 * - `McpError`: RequestTimeout → TIMEOUT, ConnectionClosed → NETWORK, otherwise a
 *   server-side JSON-RPC error → GENERAL with the `MCP error (code): message` shape
 *   (message passed through verbatim per AGENTS.md §3).
 * - `StreamableHTTPError` (HTTP status in `.code`) → GENERAL with the
 *   `MCP request failed: <status>` shape so the fallback detectors still match.
 * - Anything else (e.g. a `TypeError` from `fetch`) is returned unchanged so the
 *   runtime keeps its errno-specific handling.
 */
export function mapSdkError(error: unknown): unknown {
  if (error instanceof BailianError) return error;

  if (error instanceof McpError) {
    const raw = rawMcpMessage(error);
    if (error.code === ErrorCode.RequestTimeout) {
      return new BailianError(raw || "MCP request timed out.", ExitCode.TIMEOUT);
    }
    if (error.code === ErrorCode.ConnectionClosed) {
      return new BailianError(raw || "MCP connection closed.", ExitCode.NETWORK);
    }
    return new BailianError(`MCP error (${error.code}): ${raw}`, ExitCode.GENERAL);
  }

  if (error instanceof StreamableHTTPError) {
    const status = error.code;
    return new BailianError(`MCP request failed: ${status}`, ExitCode.GENERAL, undefined, {
      api: { httpStatus: typeof status === "number" ? status : undefined },
      cause: error,
    });
  }

  return error;
}

/**
 * Recover the raw server message from an SDK `McpError`.
 *
 * The SDK bakes its own `MCP error <code>: ` prefix into `.message` and does not
 * retain the original text, so strip that exact prefix to restore the verbatim
 * message the old hand-rolled client surfaced (keeping the `MCP error (<code>): …`
 * contract and the MCP-not-activated hint's body matching intact).
 */
function rawMcpMessage(error: McpError): string {
  const prefix = `MCP error ${error.code}: `;
  return error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message;
}

/**
 * Build the transport-level fetch. It reproduces the old client's error contract
 * for message POSTs and mirrors its `--verbose` wire logging. GET responses are
 * passed through untouched so the SDK's own SSE-stream handling (including the
 * tolerated 405 on a standalone Streamable GET) stays intact.
 */
function createMcpFetch(deps: HttpDeps): FetchLike {
  return async (url, init) => {
    const method = init?.method ?? "GET";
    const target = typeof url === "string" ? url : url.href;

    if (deps.settings.verbose) {
      console.error(`> ${method} ${target}`);
      if (typeof init?.body === "string") {
        try {
          const parsed = JSON.parse(init.body) as { method?: string };
          if (parsed.method) console.error(`> Method: ${parsed.method}`);
        } catch {
          /* non-JSON body */
        }
      }
    }

    const response = await fetch(url, init);

    if (deps.settings.verbose) {
      console.error(`< ${response.status} ${response.statusText}`);
    }

    if (!response.ok && method === "POST") {
      let message = `MCP request failed: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.text();
        if (errorBody) message += ` - ${errorBody.slice(0, 500)}`;
      } catch {
        /* body already consumed or unreadable */
      }
      throw new BailianError(message, ExitCode.GENERAL);
    }

    return response;
  };
}

/**
 * `McpConnectedClient` implementation delegating to the official SDK client.
 * Construction is lazy: no network until {@link initialize}.
 */
export class SdkMcpAdapter implements McpConnectedClient {
  private readonly deps: HttpDeps;
  private readonly url: string;
  private readonly authToken: string | undefined;
  private readonly kind: SdkMcpTransportKind;
  private readonly serviceSource: string | undefined;

  private client: Client | undefined;
  private transport: Transport | undefined;
  private connecting: Promise<void> | undefined;

  constructor(options: SdkMcpAdapterOptions) {
    this.deps = options.deps;
    this.url = options.url;
    this.authToken = options.authToken;
    this.kind = options.transport;
    this.serviceSource = options.serviceSource;
  }

  /** Open the transport and run the initialize handshake. Idempotent. */
  async initialize(): Promise<void> {
    if (!this.authToken) {
      throw new BailianError("This command needs a model-domain API key.", ExitCode.AUTH);
    }
    if (!this.connecting) {
      this.connecting = this.connect().catch((error) => {
        // Allow a later initialize() to retry on the same instance.
        this.connecting = undefined;
        throw mapSdkError(error);
      });
    }
    return this.connecting;
  }

  async listTools(): Promise<McpTool[]> {
    const client = await this.requireClient();
    try {
      const result = await client.listTools(undefined, this.requestOptions());
      return result.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description !== undefined ? { description: tool.description } : {}),
        ...(tool.inputSchema !== undefined
          ? { inputSchema: tool.inputSchema as Record<string, unknown> }
          : {}),
      }));
    } catch (error) {
      throw mapSdkError(error);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const client = await this.requireClient();
    try {
      const result = (await client.callTool(
        { name, arguments: args },
        undefined,
        this.requestOptions(),
      )) as {
        content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
        isError?: boolean;
      };
      // Non-task tools (all Bailian MCP tools) resolve to the `content` shape;
      // the task shape carries `toolResult` instead and is out of scope here.
      if (!Array.isArray(result.content)) {
        throw new BailianError("MCP tool returned an unexpected result shape.", ExitCode.GENERAL);
      }
      return {
        content: result.content.map((part) => mapContentPart(part)),
        ...(result.isError !== undefined ? { isError: result.isError } : {}),
      };
    } catch (error) {
      throw mapSdkError(error);
    }
  }

  /** Close the transport (fire-and-forget; aborts any background SSE stream). */
  close(): void {
    const transport = this.transport;
    this.client = undefined;
    this.transport = undefined;
    this.connecting = undefined;
    if (transport) {
      void transport.close().catch(() => undefined);
    }
  }

  // ---- Internal ----

  private async connect(): Promise<void> {
    const headers: Record<string, string> = {
      "User-Agent": `${this.deps.identity.clientName}/${this.deps.identity.version}`,
      ...trackingHeaders(this.deps.identity, this.serviceSource),
      Authorization: `Bearer ${this.authToken}`,
    };

    const mcpFetch = createMcpFetch(this.deps);
    const endpoint = new URL(this.url);
    const transport =
      this.kind === "sse"
        ? new SSEClientTransport(endpoint, { requestInit: { headers }, fetch: mcpFetch })
        : new StreamableHTTPClientTransport(endpoint, {
            requestInit: { headers },
            fetch: mcpFetch,
          });

    const client = new Client(
      { name: this.deps.identity.clientName, version: this.deps.identity.version },
      { capabilities: {} },
    );

    await client.connect(transport, this.requestOptions());

    this.transport = transport;
    this.client = client;

    if (this.deps.settings.verbose) {
      const label = this.kind === "sse" ? "MCP SSE" : "MCP";
      const session =
        transport instanceof StreamableHTTPClientTransport
          ? (transport.sessionId ?? "no session")
          : "no session";
      console.error(`[${label}] Session initialized: ${session}`);
      console.error(`[${label}] Server: ${JSON.stringify(client.getServerVersion() ?? {})}`);
    }
  }

  private async requireClient(): Promise<Client> {
    await this.initialize();
    if (!this.client) {
      throw new BailianError("MCP client is not connected.", ExitCode.GENERAL);
    }
    return this.client;
  }

  private requestOptions(): { timeout: number } {
    return { timeout: this.deps.settings.timeout * 1000 };
  }
}

/** Map an SDK content part onto the loose {@link McpToolResult} content shape. */
function mapContentPart(part: { type: string; text?: string; data?: string; mimeType?: string }): {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
} {
  if (part.type === "text" && typeof part.text === "string") {
    return { type: "text", text: part.text };
  }
  if ((part.type === "image" || part.type === "audio") && typeof part.data === "string") {
    return {
      type: part.type,
      data: part.data,
      ...(typeof part.mimeType === "string" ? { mimeType: part.mimeType } : {}),
    };
  }
  return { type: part.type };
}
