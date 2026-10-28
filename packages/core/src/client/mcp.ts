/**
 * MCP (Model Context Protocol) client surface for Bailian / DashScope.
 *
 * Holds the shared MCP types, the Bailian URL convention, the transport-failure
 * detectors, and the Streamable-HTTP → classic-SSE fallback orchestration. The
 * wire protocol itself (JSON-RPC over Streamable HTTP / SSE) is delegated to the
 * official `@modelcontextprotocol/sdk` via `SdkMcpAdapter` (see `mcp-sdk.ts`).
 *
 * Protocol flow: initialize → tools/list → tools/call
 *
 * Auth: always sends `Authorization: Bearer <DashScope sk-key>` injected by the
 * caller (Client.mcp). Bailian MCPs all accept this; non-Bailian endpoints
 * are out of scope for this client.
 */

import { BailianError } from "../errors/base.ts";
import type { HttpDeps } from "./http.ts";
import { SdkMcpAdapter } from "./mcp-sdk.ts";

// ---- MCP Tool Types ----

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * One content block of an MCP tool result (text / image / audio / resource /
 * resource_link …). Mirrors the standard fields the SDK validation retains;
 * the index signature keeps further standard fields visible to consumers.
 */
export interface McpToolResultContent {
  type: string;
  /** `text` content payload. */
  text?: string;
  /** base64 payload of `image` / `audio` content. */
  data?: string;
  mimeType?: string;
  /** `resource_link` / embedded-resource identifiers. */
  uri?: string;
  name?: string;
  title?: string;
  description?: string;
  /** Embedded resource payload of `resource` content. */
  resource?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpToolResult {
  content: McpToolResultContent[];
  /** Structured tool output carried alongside `content`; preserved verbatim. */
  structuredContent?: Record<string, unknown>;
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
 * Anchored to HTTP wrapper text only (not JSON-RPC / nested copies). Bailian 404 excluded.
 */
export function isStreamableHttpUnsupported(error: unknown): boolean {
  if (!(error instanceof BailianError)) return false;
  return /^MCP request failed:\s*405\b/i.test(error.message);
}

/**
 * SSE fallback for `--url` (official backwards-compat: same URL, HTTP 405/404 then GET SSE).
 */
export function isUrlOverrideSseFallbackCandidate(error: unknown): boolean {
  if (!(error instanceof BailianError)) return false;
  return /^MCP request failed:\s*(405|404)\b/i.test(error.message);
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
  /**
   * Overrides the `X-Dashscope-Service` attribution value on these connections
   * (default `bailian-cli`). AIGC "auto"-mode MCP calls pass `bailian-cli-call`.
   */
  serviceSource?: string;
};

/**
 * Connect via Streamable HTTP first; on 405 (except WebSearch), fall back to SSE.
 * `--url` uses the same URL for Streamable then classic SSE (official backwards-compat).
 * For WebSearch, rethrow the original error so commands can attach a re-activate hint.
 */
export async function connectBailianMcpWithFallback(
  options: ConnectBailianMcpOptions,
): Promise<{ client: McpConnectedClient; url: string }> {
  const { deps, authToken, httpUrl, sseUrl, serverCode, urlOverride, serviceSource } = options;

  if (urlOverride) {
    const httpClient = new SdkMcpAdapter({
      deps,
      url: urlOverride,
      authToken,
      transport: "streamable",
      serviceSource,
    });
    try {
      await httpClient.initialize();
      return { client: httpClient, url: urlOverride };
    } catch (error) {
      if (!isUrlOverrideSseFallbackCandidate(error)) {
        throw error;
      }
    }

    const sseClient = new SdkMcpAdapter({
      deps,
      url: urlOverride,
      authToken,
      transport: "sse",
      serviceSource,
    });
    try {
      await sseClient.initialize();
      return { client: sseClient, url: urlOverride };
    } catch (error) {
      sseClient.close();
      throw error;
    }
  }

  const httpClient = new SdkMcpAdapter({
    deps,
    url: httpUrl,
    authToken,
    transport: "streamable",
    serviceSource,
  });
  try {
    await httpClient.initialize();
    return { client: httpClient, url: httpUrl };
  } catch (error) {
    if (!isStreamableHttpUnsupported(error) || serverCode === "WebSearch") {
      throw error;
    }
  }

  const sseClient = new SdkMcpAdapter({
    deps,
    url: sseUrl,
    authToken,
    transport: "sse",
    serviceSource,
  });
  try {
    await sseClient.initialize();
    return { client: sseClient, url: sseUrl };
  } catch (error) {
    sseClient.close();
    throw error;
  }
}
