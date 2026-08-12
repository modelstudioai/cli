/**
 * MCP classic HTTP+SSE client (protocol 2024-11-05 transport).
 *
 * Flow: GET /sse → endpoint event → POST JSON-RPC to message URL;
 * responses arrive as SSE `message` events matched by JSON-RPC id.
 */

import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { HttpDeps } from "./http.ts";
import { trackingHeaders } from "./headers.ts";
import type { McpTool, McpToolResult } from "./mcp.ts";
import { parseSSE } from "./stream.ts";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type PendingResolver = {
  resolve: (value: JsonRpcResponse) => void;
  reject: (reason: unknown) => void;
};

export class McpSseClient {
  private sseUrl: string;
  private messageUrl: string | undefined;
  private nextId = 1;
  private deps: HttpDeps;
  private authToken: string | undefined;
  private abortController: AbortController | undefined;
  private pending = new Map<number, PendingResolver>();
  private endpointReady: Promise<void>;
  private resolveEndpoint: (() => void) | undefined;
  private rejectEndpoint: ((reason: unknown) => void) | undefined;
  private closed = false;

  constructor(deps: HttpDeps, sseUrl: string, authToken?: string) {
    this.deps = deps;
    this.sseUrl = sseUrl;
    this.authToken = authToken;
    this.endpointReady = new Promise<void>((resolve, reject) => {
      this.resolveEndpoint = resolve;
      this.rejectEndpoint = reject;
    });
  }

  /** Open the SSE session and run initialize / notifications/initialized. */
  async initialize(): Promise<void> {
    if (!this.authToken) {
      throw new BailianError("This command needs a model-domain API key.", ExitCode.AUTH);
    }

    await this.openSse();

    const result = await this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: this.deps.identity.clientName,
        version: this.deps.identity.version,
      },
    });

    if (this.deps.settings.verbose) {
      console.error(`[MCP SSE] Session initialized`);
      console.error(`[MCP SSE] Server: ${JSON.stringify(result)}`);
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

  /** Abort the hanging GET /sse so the CLI process can exit. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.abortController?.abort();
    for (const [, waiter] of this.pending) {
      waiter.reject(new BailianError("MCP SSE session closed.", ExitCode.GENERAL));
    }
    this.pending.clear();
  }

  private async openSse(): Promise<void> {
    if (this.abortController) return;

    // Keep the GET open until close(); timeouts apply only to endpoint wait / per-RPC.
    this.abortController = new AbortController();

    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      "User-Agent": `${this.deps.identity.clientName}/${this.deps.identity.version}`,
      ...trackingHeaders(this.deps.identity),
    };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    if (this.deps.settings.verbose) {
      console.error(`> GET ${this.sseUrl}`);
    }

    const response = await fetch(this.sseUrl, {
      method: "GET",
      headers,
      signal: this.abortController.signal,
    });

    if (this.deps.settings.verbose) {
      console.error(`< ${response.status} ${response.statusText}`);
    }

    if (!response.ok) {
      let errMsg = `MCP request failed: ${response.status} ${response.statusText}`;
      try {
        const errBody = await response.text();
        if (errBody) errMsg += ` - ${errBody.slice(0, 500)}`;
      } catch {
        /* ignore */
      }
      const error = new BailianError(errMsg, ExitCode.GENERAL);
      this.rejectEndpoint?.(error);
      throw error;
    }

    void this.consumeSse(response).catch((error) => {
      if (this.closed) return;
      const reason =
        error instanceof BailianError
          ? error
          : new BailianError(
              `MCP SSE stream failed: ${error instanceof Error ? error.message : String(error)}`,
              ExitCode.GENERAL,
            );
      this.rejectEndpoint?.(reason);
      for (const [, waiter] of this.pending) {
        waiter.reject(reason);
      }
      this.pending.clear();
    });

    const timeoutMs = this.deps.settings.timeout * 1000;
    const endpointTimeout = cancellableTimeoutReject(
      timeoutMs,
      "MCP SSE timed out waiting for endpoint event.",
    );
    try {
      await Promise.race([this.endpointReady, endpointTimeout.promise]);
    } finally {
      endpointTimeout.cancel();
    }
  }

  private async consumeSse(response: Response): Promise<void> {
    for await (const event of parseSSE(response)) {
      if (this.closed) break;

      if (event.event === "endpoint" || (!event.event && !this.messageUrl)) {
        const raw = event.data.trim();
        if (!raw) continue;
        // Only accept same-origin message URLs so we never forward the Bearer token cross-origin.
        this.messageUrl = resolveSameOriginMessageUrl(this.sseUrl, raw);
        this.resolveEndpoint?.();
        this.resolveEndpoint = undefined;
        this.rejectEndpoint = undefined;
        continue;
      }

      if (event.event === "message" || event.event === undefined) {
        let payload: JsonRpcResponse;
        try {
          payload = JSON.parse(event.data) as JsonRpcResponse;
        } catch {
          continue;
        }
        if (typeof payload.id !== "number") continue;
        const waiter = this.pending.get(payload.id);
        if (!waiter) continue;
        this.pending.delete(payload.id);
        waiter.resolve(payload);
      }
    }

    if (!this.messageUrl) {
      const error = new BailianError(
        "MCP SSE stream ended before endpoint event.",
        ExitCode.GENERAL,
      );
      this.rejectEndpoint?.(error);
      throw error;
    }
  }

  private async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const body = {
      jsonrpc: "2.0" as const,
      id,
      method,
      ...(params ? { params } : {}),
    };

    const timeoutMs = this.deps.settings.timeout * 1000;
    const responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    const responseTimeout = cancellableTimeoutReject(
      timeoutMs,
      `MCP SSE timed out waiting for response to ${method}.`,
    );

    try {
      await this.postMessage(body);
      const data = await Promise.race([responsePromise, responseTimeout.promise]);
      if (data.error) {
        throw new BailianError(
          `MCP error (${data.error.code}): ${data.error.message}`,
          ExitCode.GENERAL,
        );
      }
      return data.result;
    } catch (error) {
      this.pending.delete(id);
      throw error;
    } finally {
      responseTimeout.cancel();
    }
  }

  private async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const body = {
      jsonrpc: "2.0" as const,
      method,
      ...(params ? { params } : {}),
    };
    await this.postMessage(body);
  }

  private async postMessage(body: unknown): Promise<void> {
    if (!this.messageUrl) {
      throw new BailianError("MCP SSE message endpoint is not ready.", ExitCode.GENERAL);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": `${this.deps.identity.clientName}/${this.deps.identity.version}`,
      ...trackingHeaders(this.deps.identity),
    };
    // Bearer is only sent to a messageUrl that already passed the same-origin check.
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    if (this.deps.settings.verbose) {
      console.error(`> POST ${this.messageUrl}`);
      console.error(`> Method: ${(body as { method?: string }).method}`);
    }

    const timeoutMs = this.deps.settings.timeout * 1000;
    const res = await fetch(this.messageUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (this.deps.settings.verbose) {
      console.error(`< ${res.status} ${res.statusText}`);
    }

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
  }
}

/** Resolve the SSE endpoint data to an absolute URL and require same origin as sseUrl. */
export function resolveSameOriginMessageUrl(sseUrl: string, endpointData: string): string {
  let resolved: URL;
  let base: URL;
  try {
    base = new URL(sseUrl);
    resolved = new URL(endpointData, sseUrl);
  } catch {
    throw new BailianError(
      `MCP SSE endpoint is not a valid URL: ${endpointData}`,
      ExitCode.GENERAL,
    );
  }
  if (resolved.origin !== base.origin) {
    throw new BailianError(
      `MCP SSE endpoint origin mismatch: expected ${base.origin}, got ${resolved.origin}`,
      ExitCode.GENERAL,
    );
  }
  return resolved.toString();
}

/**
 * Cancellable timeout rejection: after Promise.race settles, call cancel()
 * to clear the timer and avoid unhandledRejection.
 */
function cancellableTimeoutReject(
  timeoutMs: number,
  message: string,
): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timer = undefined;
      reject(new BailianError(message, ExitCode.TIMEOUT));
    }, timeoutMs);
  });
  // Swallow late rejects after cancel to avoid unhandledRejection.
  void promise.catch(() => undefined);

  return {
    promise,
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
