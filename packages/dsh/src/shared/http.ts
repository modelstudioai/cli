/**
 * Direct DashScope HTTP for the plugins whose CLI counterpart does not expose
 * the full parameter surface (long-term memory, knowledge-base retrieval).
 * Service errors pass through verbatim — this layer classifies nothing.
 * @module bailian-cli-dsh/shared/http
 */
import type { Context } from "@deepseek-ai/cordis";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";

export const DASHSCOPE_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com";

/** A non-2xx DashScope response, carrying the server's own wording. */
export class DashScopeError extends Error {
  constructor(
    message: string,
    readonly detail: { status: number; code?: string; requestId?: string },
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DashScopeError";
  }
}

/**
 * Resolve the DashScope key from explicit config, then the launch environment
 * (process env, project `.env`, harness-home `.env`).
 */
export function resolveApiKey(ctx: Context, explicit?: string): string | undefined {
  if (explicit !== undefined && explicit.length > 0) return explicit;
  const entry = launchEnvironmentOf(ctx).get("DASHSCOPE_API_KEY");
  return entry !== undefined && entry.value.length > 0 ? entry.value : undefined;
}

export function resolveBaseUrl(ctx: Context, explicit?: string): string {
  if (explicit !== undefined && explicit.length > 0) return explicit;
  const entry = launchEnvironmentOf(ctx).get("DASHSCOPE_BASE_URL");
  return entry !== undefined && entry.value.length > 0 ? entry.value : DASHSCOPE_DEFAULT_BASE_URL;
}

export interface DashScopeRequest {
  url: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  apiKey: string;
  body?: unknown;
  signal?: AbortSignal | undefined;
}

interface DashScopeErrorBody {
  code?: string;
  message?: string;
  request_id?: string;
  error?: { code?: string; message?: string };
}

/**
 * Issue one DashScope request and parse its JSON body.
 * @throws {DashScopeError} on a non-2xx response or an unreadable body.
 */
export async function dashScopeFetch<T>(request: DashScopeRequest): Promise<T> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    redirect: "error",
  });

  const text = await response.text();

  if (!response.ok) {
    let parsed: DashScopeErrorBody = {};
    try {
      parsed = JSON.parse(text) as DashScopeErrorBody;
    } catch {
      // A non-JSON error body is still worth surfacing as-is.
    }
    const code = parsed.code ?? parsed.error?.code;
    const message = parsed.message ?? parsed.error?.message ?? text.trim();
    throw new DashScopeError(message.length > 0 ? message : `HTTP ${response.status}`, {
      status: response.status,
      ...(code !== undefined ? { code } : {}),
      ...(parsed.request_id !== undefined ? { requestId: parsed.request_id } : {}),
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new DashScopeError(
      "DashScope returned a non-JSON success body",
      { status: response.status },
      { cause: error },
    );
  }
}
