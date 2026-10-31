import type { HttpDeps } from "./http.ts";

function diagnosticUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    // Query values and fragments may carry credentials or user content.
    for (const key of url.searchParams.keys()) url.searchParams.set(key, "[REDACTED]");
    url.hash = "";
    return url.toString();
  } catch {
    return "[Invalid URL]";
  }
}

export function debugRequest(
  deps: Pick<HttpDeps, "debug">,
  method: string,
  url: string,
  details?: Record<string, unknown>,
): void {
  deps.debug?.({
    message: { "en-US": "HTTP request", "zh-CN": "HTTP 请求" },
    details: { method, url: diagnosticUrl(url), ...details },
  });
}

export function debugResponse(deps: Pick<HttpDeps, "debug">, response: Response): void {
  deps.debug?.({
    message: { "en-US": "HTTP response", "zh-CN": "HTTP 响应" },
    details: {
      status: response.status,
      status_text: response.statusText,
      request_id: response.headers.get("x-request-id") ?? undefined,
    },
  });
}
