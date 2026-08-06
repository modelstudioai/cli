import { maskToken } from "../utils/token.ts";
import type { HttpDeps } from "./http.ts";
import { trackingHeaders } from "./headers.ts";

/**
 * fetch-compatible signature, structurally identical to the SDK-side `FetchLike`
 * seam. Declared locally so core stays free of SDK imports.
 */
export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Tracking headers are DashScope-specific: only attach them to Alibaba Cloud
 * hosts, never to third-party providers (Anthropic / Ark / Qoder) that an
 * embedded SDK may also call through this fetch.
 */
function isAlibabaCloudHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "aliyuncs.com" || hostname.endsWith(".aliyuncs.com");
  } catch {
    return false;
  }
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * A transparent fetch wrapper carrying the client-layer cross-cutting request
 * concerns (UA, tracking headers, `--verbose` logging) for network stacks that
 * bypass {@link request} — e.g. an embedded SDK's provider clients. Deliberately
 * transport-only: no auth injection, no baseUrl handling, no timeout, and no
 * error mapping, so the caller's response semantics (status handling, SSE,
 * conflict detection) stay intact.
 */
export function createInstrumentedFetch(deps: HttpDeps): FetchImplementation {
  return async (input, init = {}) => {
    const url = requestUrl(input);
    const headers = new Headers(
      init.headers ?? (input instanceof Request ? input.headers : undefined),
    );

    if (!headers.has("user-agent")) {
      headers.set("User-Agent", `${deps.identity.clientName}/${deps.identity.version}`);
    }
    if (isAlibabaCloudHost(url)) {
      for (const [name, value] of Object.entries(trackingHeaders(deps.identity))) {
        headers.set(name, value);
      }
    }

    if (deps.settings.verbose) {
      console.error(`> ${init.method ?? "GET"} ${url}`);
      const auth = headers.get("authorization");
      if (auth) console.error(`> Auth: ${maskToken(auth.replace(/^Bearer /, ""))}`);
    }

    const res = await fetch(input, { ...init, headers });

    if (deps.settings.verbose) {
      console.error(`< ${res.status} ${res.statusText}`);
      const reqId = res.headers.get("x-request-id");
      if (reqId) {
        console.error(`request_id: ${reqId}`);
      }
    }

    return res;
  };
}
