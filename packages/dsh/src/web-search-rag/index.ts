/**
 * `bailian-cli-dsh/web-search-rag`: registers a Bailian knowledge-base
 * `WebSearchProvider` with `ctx.web`.
 *
 * Retrieval is modelled as a search provider rather than a bespoke tool so the
 * model reaches private corpora through the `web_search` it already knows —
 * no new tool, no new prompting. Calls go straight to DashScope because the
 * seam needs per-call control the CLI does not surface.
 *
 * One instance serves one knowledge base: `WebSearchRequest` carries only
 * `query` and `maxResults`, so the agent id has to come from config. Insert
 * additional rows with distinct ids to expose more than one.
 *
 * @module bailian-cli-dsh/web-search-rag
 */
import type { Context } from "@deepseek-ai/cordis";
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from "@deepseek-ai/dsh-web";
import { WebError } from "@deepseek-ai/dsh-web";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import z from "@deepseek-ai/schemastery";
import { isTokenPlanKey, tokenPlanKeyRejection } from "../shared/credentials.ts";
import { dashScopeFetch, resolveApiKey } from "../shared/http.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "bailian-web-search-rag";

/** The web seam this provider registers into. */
export const inject = ["web"];

/** Stable provider id; pin it as `searchProvider` to disambiguate. */
export const BAILIAN_KB_PROVIDER_ID = "bailian-kb";

export interface Config {
  /** DashScope key; falls back to `DASHSCOPE_API_KEY`. */
  apiKey?: string;
  /** Workspace id; also the retrieval host prefix. Falls back to `BAILIAN_WORKSPACE_ID`. */
  workspaceId?: string;
  /** Retrieval service id from the console's knowledge retrieval page. */
  agentId?: string;
  /** Default upper bound when the caller sets none. */
  maxResults?: number;
}

export const Config: z<Config> = z.object({
  apiKey: z
    .string()
    .role("secret")
    .description(
      "Pay-as-you-go DashScope key (sk-ws-); defaults to $DASHSCOPE_API_KEY. TokenPlan keys are rejected.",
    ),
  workspaceId: z.string().description("Bailian workspace id; defaults to $BAILIAN_WORKSPACE_ID."),
  agentId: z.string().description("Retrieval service (agent) id identifying the knowledge base."),
  maxResults: z.natural().description("Default source cap when the caller sets none."),
});

const DEFAULT_MAX_RESULTS = 10;

interface KnowledgeSearchNode {
  score?: number;
  text?: string;
  metadata?: {
    title?: string;
    doc_id?: string;
    doc_name?: string;
    doc_url?: string;
    page_number?: number;
  };
}

interface KnowledgeSearchResponse {
  data?: { total?: number; nodes?: readonly KnowledgeSearchNode[] };
}

export interface BailianKbProviderOptions {
  apiKey: string;
  workspaceId: string;
  agentId: string;
  maxResults: number;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** The seam requires a URL; documents without one still deserve a stable identity. */
function sourceUrl(node: KnowledgeSearchNode, index: number): string {
  const url = node.metadata?.doc_url;
  if (url !== undefined && url.length > 0) return url;
  return `bailian-kb://${node.metadata?.doc_id ?? `node-${index}`}`;
}

export class BailianKbSearchProvider implements WebSearchProvider {
  readonly id = BAILIAN_KB_PROVIDER_ID;

  constructor(private readonly options: BailianKbProviderOptions) {}

  available(): boolean {
    return (
      this.options.apiKey.length > 0 &&
      this.options.workspaceId.length > 0 &&
      this.options.agentId.length > 0
    );
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const limit = request.maxResults ?? this.options.maxResults;
    let response: KnowledgeSearchResponse;
    try {
      response = await dashScopeFetch<KnowledgeSearchResponse>({
        url: `https://${this.options.workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/indices/knowledge/search`,
        method: "POST",
        apiKey: this.options.apiKey,
        body: { query: request.query, agent_id: this.options.agentId },
        signal,
      });
    } catch (error) {
      if (isAbort(error))
        throw new WebError("knowledge base search aborted", "WEB_ABORTED", { cause: error });
      const reason = error instanceof Error ? error.message : String(error);
      throw new WebError(`knowledge base search failed: ${reason}`, "WEB_PROVIDER_ERROR", {
        cause: error,
      });
    }

    const nodes = (response.data?.nodes ?? []).slice(0, limit);
    const sources: WebSearchSource[] = nodes.map((node, index) => {
      const metadata = node.metadata ?? {};
      const title = metadata.doc_name ?? metadata.title;
      const text = node.text ?? "";
      return {
        url: sourceUrl(node, index),
        ...(title !== undefined ? { title } : {}),
        ...(text.length > 0 ? { snippet: text } : {}),
      };
    });

    const content = nodes
      .map((node) => node.text ?? "")
      .filter((text) => text.length > 0)
      .join("\n\n");

    // Truncation is the seam's job; report what this provider returned.
    return { ...(content.length > 0 ? { content } : {}), sources, truncated: false };
  }
}

export function apply(ctx: Context, config: Config): void {
  const apiKey = resolveApiKey(ctx, config.apiKey);
  // A TokenPlan key would register a provider that looks available and then 401s
  // on every search; reject it at boot instead. An absent key stays soft:
  // `available()` returns false and dsh falls back to another provider.
  if (apiKey !== undefined && isTokenPlanKey(apiKey)) {
    throw new Error(tokenPlanKeyRejection(name, "the knowledge-base API"));
  }
  const workspaceId =
    config.workspaceId ?? launchEnvironmentOf(ctx).get("BAILIAN_WORKSPACE_ID")?.value ?? "";

  ctx.web.registerSearchProvider(
    new BailianKbSearchProvider({
      apiKey: apiKey ?? "",
      workspaceId,
      agentId: config.agentId ?? "",
      maxResults: config.maxResults ?? DEFAULT_MAX_RESULTS,
    }),
  );
}
