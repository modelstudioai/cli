import type { Identity, Settings } from "../config/schema.ts";
import type { ApiErrorBody } from "../errors/api.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { mapApiError } from "../errors/api.ts";
import { maskToken } from "../utils/token.ts";
import { SOURCE_CONFIG, trackingHeaders } from "./headers.ts";

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

export async function request(deps: HttpDeps, opts: RequestOpts): Promise<Response> {
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;

  const headers: Record<string, string> = {
    "User-Agent": `${deps.identity.clientName}/${deps.identity.version}`,
    ...trackingHeaders(),
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
    console.error(`> x-dashscope-source-config: ${SOURCE_CONFIG}`);
  }

  const timeoutMs = (opts.timeout ?? deps.settings.timeout) * 1000;

  const requestSignal = createRequestSignal(timeoutMs, opts.signal);
  const res = await fetch(opts.url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body
      ? isFormData
        ? (opts.body as FormData)
        : JSON.stringify(opts.body)
      : undefined,
    signal: requestSignal.signal,
  }).finally(requestSignal.cleanup);

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
      /* non-JSON */
    }
    throw mapApiError(res.status, body, opts.url);
  }

  return res;
}

function createRequestSignal(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  const cleanup = () => {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  };

  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  controller.signal.addEventListener("abort", cleanup, { once: true });

  return { signal: controller.signal, cleanup };
}

export async function requestJson<T>(deps: HttpDeps, opts: RequestOpts): Promise<T> {
  const res = await request(deps, opts);
  let data: T & { code?: string; message?: string; request_id?: string };
  try {
    data = (await res.json()) as T & { code?: string; message?: string; request_id?: string };
  } catch {
    const contentType = res.headers.get("content-type") || "";
    throw new BailianError(
      `API returned non-JSON response (${contentType || "unknown type"}). Server may be experiencing issues.`,
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
}
