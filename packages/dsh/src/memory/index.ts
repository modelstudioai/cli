/**
 * `bailian-cli-dsh/memory`: cross-session long-term memory backed by Bailian's
 * hosted memory library.
 *
 * dsh has no memory seam — `ctx.compaction` only summarizes within one
 * session's context window and never writes across sessions — so this plugin
 * supplies the whole capability: two tools for deliberate reads and writes,
 * plus automatic retrieval and persistence around each turn.
 *
 * Calls go straight to DashScope rather than through `bl memory`, because the
 * v2 API exposes retrieval controls (`min_score`, `plan_version`,
 * `enable_rerank`, `meta_data`) the CLI does not surface.
 *
 * BILLING: add and search are charged per call, and `pro` costs roughly fifty
 * times `lite` per search. Automatic behaviour therefore defaults to `lite`,
 * retrieves once per session rather than once per turn, and never requests
 * profile extraction unless a schema is configured.
 *
 * @module bailian-cli-dsh/memory
 */
import { userInfo } from "node:os";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent, PreStepDecision } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-agent";
import type { ContentBlock, Message } from "@deepseek-ai/dsh-llm";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { isTokenPlanKey, tokenPlanKeyRejection } from "../shared/credentials.ts";
import { dashScopeFetch, resolveApiKey, resolveBaseUrl } from "../shared/http.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "bailian-memory";

/** Seams this plugin registers into. */
export const inject = ["tools", "agents"];

export interface Config {
  apiKey?: string;
  baseUrl?: string;
  /** Memory entity id. Falls back to `$BAILIAN_MEMORY_USER_ID`, then the OS user. */
  userId?: string;
  memoryLibraryId?: string;
  projectId?: string;
  /** Profile template id; omitting it skips profile extraction (and its cost). */
  profileSchema?: string;
  /** `lite` disables rerank and is ~50x cheaper per search. */
  planVersion?: "lite" | "pro";
  topK?: number;
  minScore?: number;
  /** Retrieve relevant memories and inject them into the conversation. */
  autoInject?: boolean;
  /** Retrieve on every turn instead of once per session. Costs one search per turn. */
  injectEveryTurn?: boolean;
  /** Persist each turn's new messages when the turn closes. */
  autoPersist?: boolean;
}

export const Config: z<Config> = z.object({
  apiKey: z
    .string()
    .role("secret")
    .description(
      "Pay-as-you-go DashScope key (sk-ws-); defaults to $DASHSCOPE_API_KEY. TokenPlan keys are rejected.",
    ),
  baseUrl: z.string().description("DashScope base URL override."),
  userId: z.string().description("Memory entity id owning these memories."),
  memoryLibraryId: z.string().description("Memory library id; defaults to the account default."),
  projectId: z.string().description("Memory extraction rule id."),
  profileSchema: z.string().description("Profile template id; enables profile extraction."),
  planVersion: z
    .union(["lite", "pro"] as const)
    .description("Search strategy; pro enables rerank at ~50x the cost."),
  topK: z.natural().description("Maximum memories to recall (1-100)."),
  minScore: z.number().description("Minimum similarity score, 0-1."),
  autoInject: z.boolean().description("Inject recalled memories automatically."),
  injectEveryTurn: z.boolean().description("Retrieve every turn instead of once per session."),
  autoPersist: z.boolean().description("Persist new messages when a turn closes."),
});

const DEFAULT_TOP_K = 10;
const DEFAULT_PLAN_VERSION = "lite";
const MEMORY_PATH = "/api/v2/apps/memory";

interface MemoryNode {
  memory_node_id?: string;
  content?: string;
  event?: string;
  old_content?: string;
  created_at?: number;
  updated_at?: number;
}

interface MemoryResponse {
  request_id?: string;
  memory_nodes?: readonly MemoryNode[];
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Resolution order: explicit config, then environment, then the OS user. */
function resolveUserId(ctx: Context, config: Config): string {
  if (config.userId !== undefined && config.userId.length > 0) return config.userId;
  const fromEnv = ctx.get("launchEnvironment")?.get("BAILIAN_MEMORY_USER_ID")?.value;
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return userInfo().username;
}

function textOf(content: readonly ContentBlock[]): string {
  return content
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Plain user/assistant exchanges; tool traffic and injected context are not memories. */
function conversationTurns(messages: readonly Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (message.role === "user" && message.source.kind !== "user") continue;
    const text = textOf(message.content);
    if (text.length > 0) turns.push({ role: message.role, content: text });
  }
  return turns;
}

class MemoryClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly config: Config,
    private readonly userId: string,
  ) {}

  private shared(): Record<string, unknown> {
    return {
      user_id: this.userId,
      ...(this.config.memoryLibraryId !== undefined
        ? { memory_library_id: this.config.memoryLibraryId }
        : {}),
    };
  }

  async add(
    messages: readonly ChatTurn[],
    signal: AbortSignal | undefined,
    overrides?: { customContent?: string; metaData?: Record<string, unknown> },
  ): Promise<MemoryResponse> {
    return dashScopeFetch<MemoryResponse>({
      url: `${this.baseUrl}${MEMORY_PATH}/add`,
      method: "POST",
      apiKey: this.apiKey,
      signal,
      body: {
        ...this.shared(),
        ...(overrides?.customContent !== undefined
          ? { custom_content: overrides.customContent }
          : { messages }),
        ...(this.config.projectId !== undefined ? { project_id: this.config.projectId } : {}),
        ...(this.config.profileSchema !== undefined
          ? { profile_schema: this.config.profileSchema }
          : {}),
        ...(overrides?.metaData !== undefined ? { meta_data: overrides.metaData } : {}),
      },
    });
  }

  async search(
    messages: readonly ChatTurn[],
    signal: AbortSignal | undefined,
    overrides?: { topK?: number; minScore?: number; planVersion?: "lite" | "pro" },
  ): Promise<MemoryResponse> {
    const planVersion = overrides?.planVersion ?? this.config.planVersion ?? DEFAULT_PLAN_VERSION;
    return dashScopeFetch<MemoryResponse>({
      url: `${this.baseUrl}${MEMORY_PATH}/memory_nodes/search`,
      method: "POST",
      apiKey: this.apiKey,
      signal,
      body: {
        ...this.shared(),
        messages,
        top_k: overrides?.topK ?? this.config.topK ?? DEFAULT_TOP_K,
        ...((overrides?.minScore ?? this.config.minScore) !== undefined
          ? { min_score: overrides?.minScore ?? this.config.minScore }
          : {}),
        // `enable_rerank` is what actually selects the billing tier. Sending
        // `plan_version: lite` alone still bills `pro` (verified against the
        // live API), despite the documented precedence, and pro costs ~50x
        // more per search. Send both: the flag that works, plus the
        // documented field in case the server-side precedence is fixed.
        enable_rerank: planVersion === "pro",
        plan_version: planVersion,
        ...(this.config.projectId !== undefined ? { project_ids: [this.config.projectId] } : {}),
      },
    });
  }
}

function renderMemories(nodes: readonly MemoryNode[]): string {
  const lines = nodes
    .map((node) => node.content?.trim())
    .filter((content): content is string => content !== undefined && content.length > 0)
    .map((content) => `- ${content}`);
  return `What you remember about this user from earlier sessions:\n${lines.join("\n")}`;
}

function registerTools(ctx: Context, client: MemoryClient): void {
  ctx.tools.register(
    defineTool({
      name: "bailian_memory_search",
      description:
        "Recall facts stored about this user in earlier sessions. Use when the user refers " +
        "to prior context, preferences, or decisions you have no record of in this session.",
      parameters: {
        query: { type: "string", required: true, description: "What to recall." },
        top_k: { type: "integer", description: "Maximum memories to return (1-100)." },
        min_score: { type: "number", description: "Minimum similarity score, 0-1." },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            memories: {
              type: "array",
              required: true,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string", required: true },
                  content: { type: "string", required: true },
                },
              },
            },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text:
              value.memories.length === 0
                ? "No relevant memories."
                : value.memories.map((memory) => `- ${memory.content}`).join("\n"),
          },
        ],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const response = await client.search([{ role: "user", content: args.query }], exec.signal, {
          ...(args.top_k !== undefined ? { topK: args.top_k } : {}),
          ...(args.min_score !== undefined ? { minScore: args.min_score } : {}),
        });
        return {
          memories: (response.memory_nodes ?? []).map((node) => ({
            id: node.memory_node_id ?? "",
            content: node.content ?? "",
          })),
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "bailian_memory_add",
      description:
        "Store a durable fact about this user so later sessions can recall it. Use for stable " +
        "preferences, decisions, and context — not for transient task state.",
      parameters: {
        content: { type: "string", required: true, description: "The fact to remember." },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { stored: { type: "integer", required: true } },
        },
        render: (_args, value) => [
          { type: "text", text: `Stored ${value.stored} memory fragment(s).` },
        ],
      },
      async execute(args, exec) {
        const response = await client.add([], exec.signal, { customContent: args.content });
        return { stored: (response.memory_nodes ?? []).length };
      },
    }),
  );
}

function registerLifecycle(ctx: Context, client: MemoryClient, config: Config): void {
  const injected = new WeakSet<Agent>();
  const persistedUpTo = new WeakMap<Agent, number>();

  if (config.autoInject !== false) {
    ctx.on(
      "agent/pre-step",
      async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
        const decision = await next();
        if (decision.kind !== "enter") return decision;
        if (injected.has(agent) && config.injectEveryTurn !== true) return decision;

        const query = textOf(messages.flatMap((message) => message.content));
        if (query.length === 0) return decision;

        let nodes: readonly MemoryNode[];
        try {
          const response = await client.search([{ role: "user", content: query }], signal);
          nodes = response.memory_nodes ?? [];
        } catch {
          // Recall is an enhancement; a memory-service outage must not stop the turn.
          return decision;
        }
        injected.add(agent);
        if (nodes.length === 0) return decision;

        const text = renderMemories(nodes);
        return {
          ...decision,
          messages: [
            ...decision.messages,
            createUserMessage({
              content: [{ type: "text", text }],
              source: {
                kind: "plugin",
                plugin: name,
                form: "snapshot",
                sections: [{ name, text }],
              },
            }),
          ],
        };
      },
      { prepend: true },
    );
  }

  if (config.autoPersist !== false) {
    ctx.on("agent/turn-stopping", async ({ agent, signal }): Promise<void> => {
      const turns = conversationTurns(agent.session.deriveMessages());
      const from = persistedUpTo.get(agent) ?? 0;
      const fresh = turns.slice(from);
      if (fresh.length === 0) return;
      persistedUpTo.set(agent, turns.length);
      try {
        await client.add(fresh, signal);
      } catch {
        // Persistence is best-effort; never fail a turn over it.
        persistedUpTo.set(agent, from);
      }
    });
  }
}

export function apply(ctx: Context, config: Config): void {
  const apiKey = resolveApiKey(ctx, config.apiKey);
  if (apiKey === undefined) {
    throw new Error(
      "bailian-memory: no DashScope API key. Set `apiKey` in this row's config or export " +
        "$DASHSCOPE_API_KEY (a pay-as-you-go sk-ws- key; the memory API 401s TokenPlan keys).",
    );
  }
  if (isTokenPlanKey(apiKey)) {
    throw new Error(tokenPlanKeyRejection(name, "the memory API"));
  }
  const client = new MemoryClient(
    apiKey,
    resolveBaseUrl(ctx, config.baseUrl),
    config,
    resolveUserId(ctx, config),
  );
  registerTools(ctx, client);
  registerLifecycle(ctx, client, config);
}
