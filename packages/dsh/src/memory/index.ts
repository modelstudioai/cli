/**
 * `bailian-cli-dsh/memory` (Host half): cross-session long-term memory backed
 * by Bailian's hosted memory library (DashScope memory v2 API).
 *
 * Provides:
 * - Two model tools: `bailian_memory_search` (recall) + `bailian_memory_add`
 *   (store), plus `bailian_memory_list` (browse).
 * - Auto-inject: on the first turn of each session (or every turn if
 *   configured), search memory and inject relevant facts into context.
 * - Auto-persist: when a turn closes, send new user/assistant messages to
 *   the add API so future sessions can recall them.
 * - webServer routes for the Client settings page to configure memory
 *   parameters (apiKey, baseUrl, userId, planVersion, etc.).
 *
 * Calls go straight to DashScope rather than through `bl memory`, because
 * the v2 API exposes retrieval controls (`min_score`, `plan_version`,
 * `enable_rerank`, `memory_library_id`, `enable_judge`, `enable_rewrite`)
 * the CLI does not surface.
 *
 * BILLING: add and search are charged per call. `pro` costs ~50x `lite` per
 * search. The `enable_rerank` flag is what actually selects the billing tier
 * (verified: sending `plan_version: lite` alone still bills `pro`).
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
import type { IncomingMessage, ServerResponse } from "node:http";
import { isTokenPlanKey, tokenPlanKeyRejection } from "../shared/credentials.ts";
import { dashScopeFetch } from "../shared/http.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "bailian-memory";

/** Seams this plugin registers into. */
export const inject = ["tools", "agents", "webServer"];

export interface Config {
  /** DashScope API key (pay-as-you-go sk-ws-). Falls back to $DASHSCOPE_API_KEY. */
  apiKey?: string;
  /** Memory API base URL (default: https://dashscope.aliyuncs.com/api/v2/apps/memory/). */
  baseUrl?: string;
  /** Memory entity id. Falls back to $BAILIAN_MEMORY_USER_ID, then OS user. */
  userId?: string;
  /** Memory library id; defaults to the account default. */
  memoryLibraryId?: string;
  /** Memory extraction rule id. */
  projectId?: string;
  /** Profile template id; omitting skips profile extraction (and its cost). */
  profileSchema?: string;
  /** Search strategy; pro enables rerank at ~50x the cost. */
  planVersion?: "lite" | "pro";
  topK?: number;
  minScore?: number;
  /** Retrieve relevant memories and inject into the conversation. */
  autoInject?: boolean;
  /** Retrieve every turn instead of once per session. */
  injectEveryTurn?: boolean;
  /** Persist each turn's new messages when the turn closes. */
  autoPersist?: boolean;
}

export const Config: z<Config> = z.object({
  apiKey: z.string().role("secret").description("Pay-as-you-go DashScope API key (sk-)."),
  baseUrl: z.string().description("Memory API base URL."),
  userId: z.string().description("Memory entity id owning these memories."),
  memoryLibraryId: z.string().description("Memory library id."),
  projectId: z.string().description("Memory extraction rule id."),
  profileSchema: z.string().description("Profile template id; enables profile extraction."),
  planVersion: z.union(["lite", "pro"] as const).description("Search strategy; pro ~50x cost."),
  topK: z.natural().description("Maximum memories to recall (1-100)."),
  minScore: z.number().description("Minimum similarity score, 0-1."),
  autoInject: z.boolean().description("Inject recalled memories automatically."),
  injectEveryTurn: z.boolean().description("Retrieve every turn instead of once per session."),
  autoPersist: z.boolean().description("Persist new messages when a turn closes."),
});

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v2/apps/memory/";
const DEFAULT_TOP_K = 10;
const DEFAULT_PLAN_VERSION = "lite";

const CONFIG_ROUTE = "/api/bailian/memory/config";
const STATUS_ROUTE = "/api/bailian/memory/status";

interface MemoryNode {
  memory_node_id?: string;
  content?: string;
  event?: string;
  old_content?: string;
  created_at?: number;
  updated_at?: number;
  meta_data?: Record<string, unknown>;
}

interface MemoryResponse {
  request_id?: string;
  memory_nodes?: readonly MemoryNode[];
  total?: number;
  page_num?: number;
  page_size?: number;
  billing_plan?: string;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Mutable runtime config — updated via webServer route, initialized from Cordis config. */
interface MemoryRuntimeConfig {
  apiKey: string | undefined;
  baseUrl: string;
  userId: string;
  memoryLibraryId: string | undefined;
  projectId: string | undefined;
  profileSchema: string | undefined;
  planVersion: "lite" | "pro";
  topK: number;
  minScore: number | undefined;
  autoInject: boolean;
  injectEveryTurn: boolean;
  autoPersist: boolean;
}

/** Resolution order: explicit config, then env, then OS user. */
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

/** Read a UTF-8 POST body up to a size limit. */
function readJsonBody(req: IncomingMessage, maxBytes: number = 16384): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.length === 0) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

class MemoryClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly cfg: MemoryRuntimeConfig,
    private readonly userId: string,
  ) {}

  private shared(): Record<string, unknown> {
    return {
      user_id: this.userId,
      ...(this.cfg.memoryLibraryId !== undefined
        ? { memory_library_id: this.cfg.memoryLibraryId }
        : {}),
    };
  }

  async add(
    messages: readonly ChatTurn[],
    signal: AbortSignal | undefined,
    overrides?: { customContent?: string; metaData?: Record<string, unknown> },
  ): Promise<MemoryResponse> {
    return dashScopeFetch<MemoryResponse>({
      url: `${this.baseUrl}add`,
      method: "POST",
      apiKey: this.apiKey,
      signal,
      body: {
        ...this.shared(),
        ...(overrides?.customContent !== undefined
          ? { custom_content: overrides.customContent }
          : { messages }),
        ...(this.cfg.projectId !== undefined ? { project_id: this.cfg.projectId } : {}),
        ...(this.cfg.profileSchema !== undefined ? { profile_schema: this.cfg.profileSchema } : {}),
        ...(overrides?.metaData !== undefined ? { meta_data: overrides.metaData } : {}),
      },
    });
  }

  async search(
    messages: readonly ChatTurn[],
    signal: AbortSignal | undefined,
    overrides?: { topK?: number; minScore?: number; planVersion?: "lite" | "pro" },
  ): Promise<MemoryResponse> {
    const planVersion = overrides?.planVersion ?? this.cfg.planVersion ?? DEFAULT_PLAN_VERSION;
    return dashScopeFetch<MemoryResponse>({
      url: `${this.baseUrl}memory_nodes/search`,
      method: "POST",
      apiKey: this.apiKey,
      signal,
      body: {
        ...this.shared(),
        messages,
        top_k: overrides?.topK ?? this.cfg.topK ?? DEFAULT_TOP_K,
        ...((overrides?.minScore ?? this.cfg.minScore) !== undefined
          ? { min_score: overrides?.minScore ?? this.cfg.minScore }
          : {}),
        // enable_rerank is what actually selects the billing tier (verified:
        // plan_version alone still bills pro). Send both for safety.
        enable_rerank: planVersion === "pro",
        plan_version: planVersion,
        ...(this.cfg.projectId !== undefined ? { project_ids: [this.cfg.projectId] } : {}),
      },
    });
  }

  async list(
    signal: AbortSignal | undefined,
    overrides?: { pageNum?: number; pageSize?: number },
  ): Promise<MemoryResponse> {
    const params = new URLSearchParams({
      user_id: this.userId,
      page_num: String(overrides?.pageNum ?? 1),
      page_size: String(overrides?.pageSize ?? 10),
      ...(this.cfg.memoryLibraryId !== undefined
        ? { memory_library_id: this.cfg.memoryLibraryId }
        : {}),
    });
    return dashScopeFetch<MemoryResponse>({
      url: `${this.baseUrl}memory_nodes?${params.toString()}`,
      method: "GET",
      apiKey: this.apiKey,
      signal,
    });
  }
}

function formatMemories(nodes: readonly MemoryNode[]): string {
  const items = nodes
    .map((node) => node.content?.trim())
    .filter((content): content is string => content !== undefined && content.length > 0);
  if (items.length === 0) return "";
  return `What you remember about this user from earlier sessions:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

/** Register model tools for deliberate memory operations. */
function registerTools(ctx: Context, client: () => MemoryClient | undefined): void {
  ctx.tools.register(
    defineTool({
      name: "bailian_memory_search",
      description:
        "Recall facts stored about this user in earlier sessions. Use when the user refers to prior context, preferences, or decisions you have no record of in this session.",
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
                : value.memories.map((m: any) => `- ${m.content}`).join("\n"),
          },
        ],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const mem = client();
        if (mem === undefined)
          throw new Error(
            "bailian-memory: not configured. Set apiKey in the Bailian settings page or config.",
          );
        const result = await mem.search([{ role: "user", content: args.query }], exec.signal, {
          ...(args.top_k !== undefined ? { topK: args.top_k } : {}),
          ...(args.min_score !== undefined ? { minScore: args.min_score } : {}),
        });
        return {
          memories: (result.memory_nodes ?? []).map((node) => ({
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
        "Store a durable fact about this user so later sessions can recall it. Use for stable preferences, decisions, and context — not for transient task state.",
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
        const mem = client();
        if (mem === undefined)
          throw new Error(
            "bailian-memory: not configured. Set apiKey in the Bailian settings page or config.",
          );
        const result = await mem.add([], exec.signal, { customContent: args.content });
        return { stored: (result.memory_nodes ?? []).length };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "bailian_memory_list",
      description:
        "List all stored memory fragments for this user. Use to review what the system already knows.",
      parameters: {
        page_size: { type: "integer", description: "Results per page (default 10)." },
        page_num: { type: "integer", description: "Page number, starting from 1." },
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
            total: { type: "integer", required: true },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text: `${value.total} memory fragment(s):\n${value.memories.map((m: any) => `- ${m.content}`).join("\n")}`,
          },
        ],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const mem = client();
        if (mem === undefined) throw new Error("bailian-memory: not configured.");
        const result = await mem.list(exec.signal, {
          ...(args.page_size !== undefined ? { pageSize: args.page_size } : {}),
          ...(args.page_num !== undefined ? { pageNum: args.page_num } : {}),
        });
        return {
          memories: (result.memory_nodes ?? []).map((node) => ({
            id: node.memory_node_id ?? "",
            content: node.content ?? "",
          })),
          total: result.total ?? 0,
        };
      },
    }),
  );
}

/** Auto-inject (search on first turn) + auto-persist (add on turn end). */
function registerAutoBehavior(
  ctx: Context,
  client: () => MemoryClient | undefined,
  cfg: () => MemoryRuntimeConfig,
): void {
  const injectedSessions = new WeakSet<Agent>();
  const persistedCursor = new WeakMap<Agent, number>();

  const currentCfg = cfg();

  if (currentCfg.autoInject !== false) {
    ctx.on(
      "agent/pre-step",
      async (
        {
          agent,
          messages,
          signal,
        }: { agent: Agent; messages: readonly Message[]; signal: AbortSignal },
        next: () => Promise<PreStepDecision>,
      ) => {
        const decision = await next();
        if (decision.kind !== "enter") return decision;
        if (injectedSessions.has(agent) && currentCfg.injectEveryTurn !== true) return decision;

        const query = textOf(messages.flatMap((m) => m.content));
        if (query.length === 0) return decision;

        const mem = client();
        if (mem === undefined) return decision;

        let nodes: readonly MemoryNode[] = [];
        try {
          const result = await mem.search([{ role: "user", content: query }], signal);
          nodes = result.memory_nodes ?? [];
        } catch {
          return decision;
        }

        injectedSessions.add(agent);
        if (nodes.length === 0) return decision;

        const text = formatMemories(nodes);
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

  if (currentCfg.autoPersist !== false) {
    ctx.on(
      "agent/turn-stopping",
      async ({ agent, signal }: { agent: Agent; signal: AbortSignal }) => {
        const mem = client();
        if (mem === undefined) return;

        const turns = conversationTurns(agent.session.deriveMessages());
        const cursor = persistedCursor.get(agent) ?? 0;
        const newTurns = turns.slice(cursor);
        if (newTurns.length === 0) return;

        persistedCursor.set(agent, turns.length);
        try {
          await mem.add(newTurns, signal);
        } catch {
          persistedCursor.set(agent, cursor);
        }
      },
    );
  }
}

export function apply(ctx: Context, config: Config): void {
  const webServer = ctx.get("webServer");

  // Mutable runtime config — initialized from Cordis config, updatable via webServer route.
  let runtime: MemoryRuntimeConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    userId: resolveUserId(ctx, config),
    memoryLibraryId: config.memoryLibraryId,
    projectId: config.projectId,
    profileSchema: config.profileSchema,
    planVersion: config.planVersion ?? DEFAULT_PLAN_VERSION,
    topK: config.topK ?? DEFAULT_TOP_K,
    minScore: config.minScore,
    autoInject: config.autoInject ?? true,
    injectEveryTurn: config.injectEveryTurn ?? false,
    autoPersist: config.autoPersist ?? true,
  };

  /** Build a MemoryClient from the current runtime config, or undefined if no API key. */
  function buildClient(): MemoryClient | undefined {
    if (runtime.apiKey === undefined || runtime.apiKey.length === 0) return undefined;
    if (isTokenPlanKey(runtime.apiKey)) {
      throw new Error(tokenPlanKeyRejection(name, "the memory API"));
    }
    return new MemoryClient(runtime.apiKey, runtime.baseUrl, runtime, runtime.userId);
  }

  // Register tools + auto behavior.
  registerTools(ctx, buildClient);
  registerAutoBehavior(ctx, buildClient, () => runtime);

  // webServer routes for the Client settings page.
  if (webServer !== undefined) {
    ctx.effect(() =>
      webServer.register({
        kind: "exact",
        path: STATUS_ROUTE,
        handler: async (_req: IncomingMessage, res: ServerResponse) => {
          sendJson(res, 200, {
            configured: runtime.apiKey !== undefined && runtime.apiKey.length > 0,
            userId: runtime.userId,
            baseUrl: runtime.baseUrl,
            planVersion: runtime.planVersion,
            topK: runtime.topK,
            autoInject: runtime.autoInject,
            injectEveryTurn: runtime.injectEveryTurn,
            autoPersist: runtime.autoPersist,
            memoryLibraryId: runtime.memoryLibraryId,
          });
        },
      }),
    );

    ctx.effect(() =>
      webServer.register({
        kind: "exact",
        path: CONFIG_ROUTE,
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "use POST" });
            return;
          }
          let body: Record<string, unknown>;
          try {
            body = (await readJsonBody(req)) as Record<string, unknown>;
          } catch (error) {
            sendJson(res, 400, { error: error instanceof Error ? error.message : "bad request" });
            return;
          }

          // Update mutable fields from the request body.
          if (typeof body.apiKey === "string") runtime.apiKey = body.apiKey || undefined;
          if (typeof body.baseUrl === "string" && body.baseUrl.length > 0)
            runtime.baseUrl = body.baseUrl;
          if (typeof body.userId === "string" && body.userId.length > 0)
            runtime.userId = body.userId;
          if (typeof body.memoryLibraryId === "string")
            runtime.memoryLibraryId = body.memoryLibraryId || undefined;
          if (typeof body.projectId === "string") runtime.projectId = body.projectId || undefined;
          if (typeof body.profileSchema === "string")
            runtime.profileSchema = body.profileSchema || undefined;
          if (body.planVersion === "lite" || body.planVersion === "pro")
            runtime.planVersion = body.planVersion;
          if (typeof body.topK === "number") runtime.topK = body.topK;
          if (typeof body.minScore === "number") runtime.minScore = body.minScore;
          if (typeof body.autoInject === "boolean") runtime.autoInject = body.autoInject;
          if (typeof body.injectEveryTurn === "boolean")
            runtime.injectEveryTurn = body.injectEveryTurn;
          if (typeof body.autoPersist === "boolean") runtime.autoPersist = body.autoPersist;

          sendJson(res, 200, {
            ok: true,
            configured: runtime.apiKey !== undefined && runtime.apiKey.length > 0,
          });
        },
      }),
    );
  }
}
