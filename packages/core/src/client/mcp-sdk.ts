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
 *   Classic SSE stream GET failures carry the same contract: `eventsource`
 *   drops non-200 GET bodies, so the interceptor captures status/body and
 *   `mapSdkError` rebuilds the message from the SDK's `SseError`.
 * - `MCP error (<code>): <message>` for JSON-RPC business errors (passthrough).
 * - Raw `TypeError` (e.g. ENOTFOUND) propagation so runtime can surface errno.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { FetchLike, Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { trackingHeaders } from "./headers.ts";
import type { HttpDeps } from "./http.ts";
import type { McpConnectedClient, McpTool, McpToolResult } from "./mcp.ts";
import { httpTransport } from "./transport.ts";

/**
 * Low-level Streamable HTTP MCP client keeping the constructor and method
 * signatures published by earlier `bailian-cli-core` versions; delegates to
 * {@link SdkMcpAdapter}. It drives a single transport at a caller-supplied URL
 * and token — for the orchestrated entry (URL/credential resolution,
 * Streamable→SSE fallback, channel attribution) use `Client.connectBailianMcp`
 * / `connectBailianMcpWithFallback`.
 */
export class McpClient implements McpConnectedClient {
  private readonly adapter: SdkMcpAdapter;

  constructor(deps: HttpDeps, url: string, authToken?: string) {
    this.adapter = new SdkMcpAdapter({ deps, url, authToken, transport: "streamable" });
  }

  /** Initialize the MCP session. Must be called before any other method. */
  initialize(): Promise<void> {
    return this.adapter.initialize();
  }

  listTools(): Promise<McpTool[]> {
    return this.adapter.listTools();
  }

  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    return this.adapter.callTool(name, args);
  }

  close(): void {
    this.adapter.close();
  }
}

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
 * - `BailianError` (already ours, produced by local timeout or the fetch
 *   interceptor) passes through.
 * - `McpError`: treated as a server-side JSON-RPC error by default and mapped to
 *   `GENERAL` with the `MCP error (<code>): <message>` shape (message passed
 *   through verbatim per AGENTS.md §3). Callers that can distinguish local
 *   transport-close events pass `localCloseFired: true` so that
 *   `ConnectionClosed` errors arising after the transport has closed are mapped
 *   to `NETWORK` instead.
 * - `StreamableHTTPError` (HTTP status in `.code`) → GENERAL with the
 *   `MCP request failed: <status>` shape so the fallback detectors still match.
 * - `SseError` (classic SSE): when the fetch interceptor captured the failing
 *   stream GET (`sseGetFailure` with a matching status), rebuild the
 *   `MCP request failed: <status> <statusText> - <body>` contract — the SDK's
 *   own message only carries `Non-200 status code (<status>)` and would lose
 *   the server body the MCP-not-activated hint matches on. Without a captured
 *   failure (e.g. a mid-stream drop) the error passes through unchanged.
 * - Anything else (e.g. a `TypeError` from `fetch`) is returned unchanged so the
 *   runtime keeps its errno-specific handling.
 */
export function mapSdkError(
  error: unknown,
  sseGetFailure?: SseGetFailure,
  options?: { localCloseFired?: boolean },
): unknown {
  if (error instanceof BailianError) return error;

  if (error instanceof McpError) {
    const raw = rawMcpMessage(error);
    if (error.code === ErrorCode.ConnectionClosed && options?.localCloseFired) {
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

  if (error instanceof SseError && sseGetFailure && sseGetFailure.status === error.code) {
    let message = `MCP request failed: ${sseGetFailure.status} ${sseGetFailure.statusText}`;
    if (sseGetFailure.body) message += ` - ${sseGetFailure.body.slice(0, 500)}`;
    return new BailianError(message, ExitCode.GENERAL, undefined, {
      api: { httpStatus: sseGetFailure.status },
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
 * Server-side failure of a classic SSE stream GET, captured by the fetch
 * interceptor before `eventsource` discards the body (it only reports
 * `Non-200 status code (<status>)` and never reads the payload).
 * `mapSdkError` rebuilds the HTTP-failure contract from it.
 */
export interface SseGetFailure {
  status: number;
  statusText: string;
  body: string;
}

/**
 * Build the transport-level fetch. Requests go through the shared
 * `httpTransport` (packaged Undici fetch on Node, native fetch on Bun) so the
 * MCP path honors the configured dispatcher/proxy like every other request
 * path. It reproduces the old client's error contract for message POSTs and
 * mirrors its `--verbose` wire logging. GET responses are passed through
 * untouched so the SDK's own SSE-stream handling (including the
 * tolerated 405 on a standalone Streamable GET) stays intact — except that a
 * failing classic SSE stream GET has its status/body captured first, since
 * `eventsource` would drop them. Redirect responses are likewise passed through:
 * the SDK wraps this fetch with its same-origin redirect policy
 * (`fetchWithinOrigin`) and must see the 3xx to follow or reject it itself —
 * intercepting it here would break same-origin redirects the old client's
 * default `redirect: "follow"` used to honor.
 */
function createMcpFetch(
  deps: HttpDeps,
  kind: SdkMcpTransportKind,
  onSseGetFailure?: (failure: SseGetFailure) => void,
): FetchLike {
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

    const response = await httpTransport.fetch(url, init);

    if (deps.settings.verbose) {
      console.error(`< ${response.status} ${response.statusText}`);
    }

    if (!response.ok && method === "POST" && !isRedirectStatus(response.status)) {
      let message = `MCP request failed: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.text();
        if (errorBody) message += ` - ${errorBody.slice(0, 500)}`;
      } catch {
        /* body already consumed or unreadable */
      }
      throw new BailianError(message, ExitCode.GENERAL);
    }

    if (
      kind === "sse" &&
      onSseGetFailure &&
      !response.ok &&
      method === "GET" &&
      !isRedirectStatus(response.status)
    ) {
      // Classic SSE: this GET *is* the connection stream. `eventsource` fails
      // non-200 responses with `Non-200 status code (<status>)` without ever
      // reading the body, and the SDK rewraps that as `SseError` — losing the
      // server payload (e.g. MCP_IS_INVALID) the not-activated hint matches on.
      // Drain it here and hand it to the adapter; returning the drained
      // response is safe because neither transport reads a non-2xx GET body.
      let body = "";
      try {
        body = await response.text();
      } catch {
        /* body already consumed or unreadable */
      }
      onSseGetFailure({ status: response.status, statusText: response.statusText, body });
    }

    return response;
  };
}

/** True for 3xx statuses the SDK's same-origin redirect policy handles itself. */
function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
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
  /** Last failed classic SSE stream GET, for `SseError` contract reconstruction. */
  private sseGetFailure: SseGetFailure | undefined;
  /**
   * Set when the transport's `onclose` callback fires. Used to distinguish
   * SDK-generated `ConnectionClosed` errors (local network events) from
   * server-authored JSON-RPC errors that reuse code -32000.
   */
  private transportClosed = false;

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
        throw this.mapTransportError(error);
      });
    }
    return this.connecting;
  }

  async listTools(): Promise<McpTool[]> {
    const client = await this.requireClient();
    try {
      const result = await this.withLocalTimeout(
        client.listTools(undefined, this.requestOptions()),
      );
      // Returned verbatim (the SDK-validated Tool objects): callers such as
      // `bl mcp tools --output json` keep every standard field the server
      // declares (outputSchema / annotations / title / `_meta`, …), matching
      // the old hand-rolled client's passthrough.
      return result.tools as McpTool[];
    } catch (error) {
      throw this.mapTransportError(error);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const client = await this.requireClient();
    try {
      const result = (await this.withLocalTimeout(
        client.callTool({ name, arguments: args }, undefined, this.requestOptions()),
      )) as McpToolResult;
      // The SDK already validates the envelope against CallToolResultSchema;
      // only a missing content array is an unexpected shape for our callers.
      if (!Array.isArray(result.content)) {
        throw new BailianError("MCP tool returned an unexpected result shape.", ExitCode.GENERAL);
      }
      // Returned verbatim (the SDK-validated object): generic consumers such as
      // `bl mcp call` keep every standard field (resource / resource_link
      // blocks, structuredContent, annotations, …). AIGC-specific extraction
      // lives in the business adapter (`aigc-mcp.ts`), not here.
      return result;
    } catch (error) {
      throw this.mapTransportError(error);
    }
  }

  /**
   * Close the transport (fire-and-forget; aborts any background SSE stream or
   * in-flight handshake, since the transport is published before awaiting).
   */
  close(): void {
    const transport = this.transport;
    this.client = undefined;
    this.transport = undefined;
    this.connecting = undefined;
    this.sseGetFailure = undefined;
    if (transport) {
      void transport.close().catch(() => undefined);
    }
  }

  // ---- Internal ----

  /** `mapSdkError` with this adapter's local transport-close state. */
  private mapTransportError(error: unknown): unknown {
    return mapSdkError(error, this.sseGetFailure, { localCloseFired: this.transportClosed });
  }

  private async connect(): Promise<void> {
    const headers: Record<string, string> = {
      "User-Agent": `${this.deps.identity.clientName}/${this.deps.identity.version}`,
      ...trackingHeaders(this.deps.identity, this.serviceSource),
      Authorization: `Bearer ${this.authToken}`,
    };

    const mcpFetch = createMcpFetch(this.deps, this.kind, (failure) => {
      this.sseGetFailure = failure;
    });
    const endpoint = new URL(this.url);
    this.transportClosed = false;

    const transport =
      this.kind === "sse"
        ? new SSEClientTransport(endpoint, { requestInit: { headers }, fetch: mcpFetch })
        : new StreamableHTTPClientTransport(endpoint, {
            requestInit: { headers },
            fetch: mcpFetch,
          });

    // Track local transport close so SDK-generated `ConnectionClosed` errors
    // can be reliably distinguished from server-authored -32000 JSON-RPC errors.
    // Protocol.connect wraps any pre-existing onclose, so this fires before the
    // SDK rejects in-flight requests.
    transport.onclose = () => {
      this.transportClosed = true;
    };

    const client = new Client(
      { name: this.deps.identity.clientName, version: this.deps.identity.version },
      { capabilities: {} },
    );

    // Publish the transport before awaiting so close() can abort handshake
    // phases the SDK's per-request timeout does not cover (the SSE endpoint
    // wait and the initialize/initialized POSTs).
    this.transport = transport;

    const handshake = client.connect(transport, this.requestOptions());
    // When we give up on the handshake (timeout / close) its later rejection
    // must not surface as an unhandled rejection.
    handshake.catch(() => undefined);

    let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
    const handshakeTimeout = new Promise<never>((_, reject) => {
      handshakeTimer = setTimeout(
        () =>
          reject(
            new BailianError(
              `MCP session handshake timed out after ${this.deps.settings.timeout}s.`,
              ExitCode.TIMEOUT,
            ),
          ),
        this.deps.settings.timeout * 1000,
      );
    });

    try {
      await Promise.race([handshake, handshakeTimeout]);
    } catch (error) {
      // Cancel the in-flight handshake: abort pending POSTs / SSE streams and
      // clear the partial state so a later initialize() starts fresh.
      this.transport = undefined;
      await transport.close().catch(() => undefined);
      throw error;
    } finally {
      if (handshakeTimer) clearTimeout(handshakeTimer);
    }

    if (this.transport !== transport) {
      // close() ran while the handshake was finishing; drop the half-open client.
      await transport.close().catch(() => undefined);
      throw new BailianError("MCP connection was closed during the handshake.", ExitCode.NETWORK);
    }

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
    // Disable the SDK's own request timer; the adapter enforces the timeout
    // locally via `withLocalTimeout` so that timeout failures carry an
    // unambiguous local source and are not confused with server JSON-RPC
    // errors that may reuse code -32001 or carry `data.timeout`.
    // Use Node's maximum setTimeout delay so the SDK timer never wins the race.
    return { timeout: 2_147_483_647 };
  }

  private async withLocalTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutSeconds = this.deps.settings.timeout;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new BailianError(`MCP request timed out after ${timeoutSeconds}s.`, ExitCode.TIMEOUT),
        );
      }, timeoutSeconds * 1000);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
