/** Shared HTTP client for the knowledge endpoints: per-call Bearer auth, JSON/SSE POST, and error translation. */

import { kbEndpoint } from "./endpoints.js";

/** Maximum error-body characters kept in a translated message. */
const ERROR_BODY_LIMIT = 500;

/** One knowledge API failure: HTTP status plus a bounded server-body summary. */
export class KbApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "KbApiError";
  }
}

export interface KbClientOptions {
  /** Resolves the current workspace id per call (patch config or credential); throws with guidance when unconfigured. */
  resolveWorkspaceId: () => Promise<string>;
  endpointHost: string;
  /** Service version forwarded on search/chat when set (deployment debug choice). */
  agentVersion?: string;
  /** Resolves the current DASHSCOPE_API_KEY per call; throws with guidance when unconfigured. */
  resolveApiKey: () => Promise<string>;
  /** Test seam; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class KbClient {
  constructor(private readonly opts: KbClientOptions) {}

  /** The deployment's configured service version, exposed for request builders. */
  get agentVersion(): string | undefined {
    return this.opts.agentVersion;
  }

  private async post(
    path: string,
    body: unknown,
    accept: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const [apiKey, workspaceId] = await Promise.all([
      this.opts.resolveApiKey(),
      this.opts.resolveWorkspaceId(),
    ]);
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const url = kbEndpoint(this.opts.endpointHost, workspaceId, path);
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: accept,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const raw = (await res.text().catch(() => "")).slice(0, ERROR_BODY_LIMIT);
      let detail = raw;
      try {
        const parsed = JSON.parse(raw) as { message?: string; code?: string };
        if (parsed.message)
          detail = parsed.code ? `${parsed.code}: ${parsed.message}` : parsed.message;
      } catch {
        /* non-JSON error body: keep the bounded raw text */
      }
      throw new KbApiError(
        `knowledge API ${path} failed (HTTP ${res.status}): ${detail}`,
        res.status,
      );
    }
    return res;
  }

  /**
   * POST one JSON request and parse the JSON response.
   * @param path - one KB_PATHS value.
   * @param body - JSON-serializable request body.
   * @param signal - optional abort/timeout signal.
   * @returns the parsed response.
   */
  async postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await this.post(path, body, "application/json", signal);
    return (await res.json()) as T;
  }

  /**
   * POST one JSON request expecting an SSE response stream.
   * @param path - one KB_PATHS value.
   * @param body - JSON-serializable request body.
   * @param signal - abort/timeout signal (kb_chat passes its configured timeout).
   * @returns the raw Response whose body is the SSE stream.
   */
  async postSse(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    return await this.post(path, body, "text/event-stream", signal);
  }
}
