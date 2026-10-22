import type { Identity, Settings } from "../config/schema.ts";
import type { ApiErrorBody } from "../errors/api.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { mapApiError } from "../errors/api.ts";
import { maskToken } from "../utils/token.ts";
import { sourceConfig, trackingHeaders } from "./headers.ts";
import { Dispatcher, getGlobalDispatcher } from "undici";

// Core owns the request deadline and body idle window. Override transport
// limits only for this request, preserving the current proxy/connection pool.
const withoutTransportTimeouts: Dispatcher.DispatcherComposeInterceptor =
  (dispatch) => (options, handler) =>
    dispatch({ ...options, headersTimeout: 0, bodyTimeout: 0 }, handler);

/** 传输层依赖:UA 用 identity,timeout/verbose 用 settings。凭证由调用方(Client)注头。 */
export interface HttpDeps {
  identity: Identity;
  settings: Settings;
}

export interface RequestOpts {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  stream?: boolean;
  async?: boolean; // Add X-DashScope-Async: enable header
  signal?: AbortSignal;
}

/**
 * Bailian requires `X-DashScope-OssResourceResolve: enable` on any request whose body
 * references an `oss://` URL (returned by the upload API). Detected automatically here
 * so callers don't need to track it manually.
 */
function bodyReferencesOssUrl(body: unknown): boolean {
  if (body == null || typeof body !== "object") return false;
  if (body instanceof FormData) return false;
  return JSON.stringify(body).includes("oss://");
}

/** Successful raw response bodies must be consumed or explicitly cancelled by the caller. */
export async function request(deps: HttpDeps, opts: RequestOpts): Promise<Response> {
  const timeoutMs = (opts.timeout ?? deps.settings.timeout) * 1000;
  const requestSignal = createRequestSignal(timeoutMs, opts.signal);
  try {
    const response = await performRequest(deps, opts, requestSignal.signal);
    // After headers, raw/streaming responses use a rolling idle window rather
    // than a total deadline. The body owns cleanup until EOF/cancel/error.
    return protectResponseBody(response, requestSignal);
  } catch (error) {
    requestSignal.cleanup();
    if (requestSignal.signal.aborted) throw requestSignal.signal.reason;
    throw error;
  }
}

async function performRequest(
  deps: HttpDeps,
  opts: RequestOpts,
  signal: AbortSignal,
): Promise<Response> {
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;

  const headers: Record<string, string> = {
    "User-Agent": `${deps.identity.clientName}/${deps.identity.version}`,
    ...trackingHeaders(deps.identity),
    ...opts.headers,
  };

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (opts.async) {
    headers["X-DashScope-Async"] = "enable";
  }

  if (bodyReferencesOssUrl(opts.body)) {
    headers["X-DashScope-OssResourceResolve"] = "enable";
  }

  if (deps.settings.verbose) {
    console.error(`> ${opts.method ?? "GET"} ${opts.url}`);
    const auth = headers["Authorization"];
    if (auth) console.error(`> Auth: ${maskToken(auth.replace(/^Bearer /, ""))}`);
    console.error(`> x-dashscope-source-config: ${sourceConfig(deps.identity)}`);
  }

  const requestInit = {
    method: opts.method ?? "GET",
    headers,
    body: opts.body
      ? isFormData
        ? (opts.body as FormData)
        : JSON.stringify(opts.body)
      : undefined,
    signal,
    // Bun's native fetch ignores dispatchers and its undici shim has no compose.
    // Keep native fetch in both runtimes, adapting only transport controls.
    ...(process.versions.bun
      ? { timeout: false as const }
      : {
          dispatcher: Dispatcher.prototype.compose.call(
            getGlobalDispatcher(),
            withoutTransportTimeouts,
          ) as unknown as RequestInit["dispatcher"],
        }),
  };
  const res = await fetch(opts.url, requestInit);

  if (deps.settings.verbose) {
    console.error(`< ${res.status} ${res.statusText}`);
    const reqId = res.headers.get("x-request-id");
    if (reqId) {
      console.error(`request_id: ${reqId}`);
    }
  }

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      if (signal.aborted) throw signal.reason;
      /* non-JSON */
    }
    throw mapApiError(res.status, body, opts.url);
  }

  return res;
}

interface RequestSignal {
  signal: AbortSignal;
  cleanup: () => void;
  abort: (reason?: unknown) => void;
  resetIdleTimeout: () => void;
  pauseTimeout: () => void;
}

function createRequestSignal(timeoutMs: number, parentSignal?: AbortSignal): RequestSignal {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  const armTimer = (reason?: unknown) => {
    if (finished) return;
    clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(reason), timeoutMs);
  };
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  const cleanup = () => {
    finished = true;
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
    controller.signal.removeEventListener("abort", cleanup);
  };

  controller.signal.addEventListener("abort", cleanup, { once: true });
  if (parentSignal?.aborted) abortFromParent();
  else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    armTimer();
  }

  return {
    signal: controller.signal,
    cleanup,
    abort: (reason) => controller.abort(reason),
    pauseTimeout: () => clearTimeout(timeout),
    resetIdleTimeout: () =>
      armTimer(
        new BailianError(
          `Response body idle timeout: no data received for ${timeoutMs / 1000}s.`,
          ExitCode.TIMEOUT,
          "Increase --timeout to allow a longer interval between response chunks.",
        ),
      ),
  };
}

function protectResponseBody(response: Response, requestSignal: RequestSignal): Response {
  if (!response.body) {
    requestSignal.cleanup();
    return response;
  }
  // Only count time spent waiting for network data, not consumer processing.
  // An unused raw response must not keep a command alive through a timer.
  requestSignal.pauseTimeout();
  const reader = response.body.getReader();
  const { signal } = requestSignal;
  let finished = false;
  let onAbort: () => void;
  const finish = () => {
    finished = true;
    signal.removeEventListener("abort", onAbort);
    requestSignal.cleanup();
  };
  const cancelSource = (reason?: unknown) =>
    reader.cancel(reason).finally(() => reader.releaseLock());
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        onAbort = () => {
          if (finished) return;
          finish();
          controller.error(signal.reason);
          void cancelSource(signal.reason).catch(() => {});
        };
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      },
      async pull(controller) {
        try {
          requestSignal.resetIdleTimeout();
          const part = await reader.read();
          requestSignal.pauseTimeout();
          if (finished) return;
          if (part.done) {
            finish();
            reader.releaseLock();
            controller.close();
          } else {
            controller.enqueue(part.value);
          }
        } catch (error) {
          if (finished) return;
          finish();
          reader.releaseLock();
          controller.error(signal.aborted ? signal.reason : error);
        }
      },
      cancel(reason) {
        finish();
        // Own transport teardown as well as reader cleanup: cancelling the
        // reader alone can leave native Bun's HTTP connection open.
        requestSignal.abort(reason);
        return cancelSource(reason).catch(() => {});
      },
    },
    { highWaterMark: 0 },
  );
  const protectedResponse = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  // A constructed Response otherwise loses fetch's URL/redirect metadata.
  Object.defineProperties(protectedResponse, {
    url: { value: response.url },
    redirected: { value: response.redirected },
    type: { value: response.type },
  });
  return protectedResponse;
}

export async function requestJson<T>(deps: HttpDeps, opts: RequestOpts): Promise<T> {
  const timeoutMs = (opts.timeout ?? deps.settings.timeout) * 1000;
  const requestSignal = createRequestSignal(timeoutMs, opts.signal);
  try {
    const res = await performRequest(deps, opts, requestSignal.signal);
    let data: T & { code?: string; message?: string; request_id?: string };
    try {
      data = (await res.json()) as T & { code?: string; message?: string; request_id?: string };
    } catch {
      if (requestSignal.signal.aborted) throw requestSignal.signal.reason;
      const contentType = res.headers.get("content-type") || "";
      throw new BailianError(
        `API returned non-JSON response (${contentType || "unknown type"}). Server may be experiencing issues.\nAPI 返回了非 JSON 响应（${contentType || "未知类型"}），服务器可能出现问题。`,
        ExitCode.GENERAL,
      );
    }

    // DashScope error format: { code: "ErrorCode", message: "..." }
    if (
      data.code &&
      typeof data.code === "string" &&
      data.code !== "200" &&
      data.code !== "Success"
    ) {
      throw mapApiError(200, { error: { message: data.message, type: data.code } }, opts.url);
    }

    return data;
  } catch (error) {
    if (requestSignal.signal.aborted) throw requestSignal.signal.reason;
    throw error;
  } finally {
    requestSignal.cleanup();
  }
}
