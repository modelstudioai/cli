import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { GenerateOptions } from "@deepseek-ai/dsh-llm";
import {
  MemoryClient,
  type MemoryEventsResponse,
  type MemorySearchHit,
} from "../../src/memory-client.ts";
import { resolveMemoryWorkspace, readPersonalMemoryConfig } from "../../src/personal-config.ts";
import { classifyMemoryEvents, type MemoTaskRecord, type TaskStore } from "../../src/task-store.ts";
import type { ResolvedConfig } from "../../src/config.ts";

export const liveEnabled = process.env.BAILIAN_MEMORY_JOURNEYS === "1";
export const config: ResolvedConfig = {
  enabled: true,
  autoRecall: true,
  autoCurate: true,
  extractProfile: false,
  profileSchemaId: undefined,
  recallTopK: 5,
  minScore: 0,
  curatorMaxOutputTokens: 1024,
  curatorTimeoutMs: 90000,
  curatorProvider: "journey-adapter",
  curatorModel: process.env.BAILIAN_MEMORY_CURATOR_MODEL ?? "unconfigured",
  workspaceId: process.env.BAILIAN_WORKSPACE_ID,
};

export async function eventually<Value>(
  read: () => Promise<Value>,
  match: (value: Value) => boolean,
  timeout = 180000,
): Promise<Value> {
  const until = Date.now() + timeout;
  do {
    const value = await read();
    if (match(value)) return value;
    await delay(2000);
  } while (Date.now() < until);
  throw new Error("Journey condition did not converge before deadline");
}

/** Deliberately a filesystem test harness, not the dsh Storage Domain implementation. */
export class FileTaskStore implements TaskStore {
  private writes: Promise<void> = Promise.resolve();
  constructor(readonly path: string) {}
  private async records(): Promise<MemoTaskRecord[]> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as MemoTaskRecord[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  async put(record: MemoTaskRecord) {
    const write = this.writes.then(async () => {
      const records = await this.records();
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(
        temporary,
        JSON.stringify([...records.filter((entry) => entry.intentId !== record.intentId), record]),
        { mode: 0o600 },
      );
      await rename(temporary, this.path);
    });
    this.writes = write.catch(() => undefined);
    await write;
  }
  async get(intentId: string) {
    await this.writes;
    return (await this.records()).find((entry) => entry.intentId === intentId);
  }
  async listOpen() {
    await this.writes;
    return (await this.records()).filter((entry) =>
      ["pending_submit", "submitted", "polling"].includes(entry.status),
    );
  }
  async listRecent(limit = 20) {
    await this.writes;
    return (await this.records()).slice(-limit).reverse();
  }
}

export class CloudHarness {
  home = "";
  path = "";
  userId = "";
  requests = 0;
  modelCalls = 0;
  modelActions: string[] = [];
  events = new Set<string>();
  schemas = new Set<string>();
  pendingSchemaNames = new Set<string>();
  knownNodes = new Set<string>();
  deletedNodes = new Set<string>();
  steps: string[] = [];
  blockers = [
    "Actual dsh host not exercised: controlled host only",
    "Task persistence uses filesystem harness, not dsh Storage Domain",
  ];
  readonly apiKey = process.env.DASHSCOPE_API_KEY ?? "";
  readonly workspace = process.env.BAILIAN_WORKSPACE_ID ?? "";
  client!: MemoryClient;

  async init() {
    if (!this.apiKey || !this.workspace)
      throw new Error("Live journey requires DASHSCOPE_API_KEY and BAILIAN_WORKSPACE_ID");
    this.home = await mkdtemp(join(tmpdir(), "memo-cloud-journey-"));
    this.path = join(this.home, ".bailian/personal-memory/config.json");
    this.client = new MemoryClient({
      resolveApiKey: async () => this.apiKey,
      resolveWorkspaceId: async () =>
        resolveMemoryWorkspace(
          this.workspace,
          (await readPersonalMemoryConfig(this.path)).workspace_id,
        ),
      fetchImpl: async (input, options) => {
        this.requests += 1;
        const response = await fetch(input, {
          ...options,
          signal: options?.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
            : AbortSignal.timeout(30000),
        });
        const address =
          input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
        if (address.includes("/add-async") && response.ok) {
          const receipt = (await response.clone().json()) as { event_id?: string };
          if (receipt.event_id) this.events.add(receipt.event_id);
        }
        if (address.includes("/events/") && response.ok) {
          this.captureNodes((await response.clone().json()) as MemoryEventsResponse);
        }
        if (
          options?.method === "DELETE" &&
          address.includes("/memory_nodes/") &&
          (response.ok || response.status === 404)
        ) {
          this.deletedNodes.add(decodeURIComponent(new URL(address).pathname.split("/").at(-1)!));
        }
        if (!response.ok)
          throw Object.assign(new Error(`Memory HTTP ${response.status}`), {
            status: response.status,
          });
        return response;
      },
    });
    return this;
  }

  async request<Result>(method: string, path: string, body?: unknown): Promise<Result> {
    const schemaName =
      method === "POST" && path === "profile_schemas"
        ? (body as { name?: string } | undefined)?.name
        : undefined;
    if (method === "POST" && path === "profile_schemas" && !schemaName)
      throw new Error("Synthetic schema creation requires a trackable name");
    if (schemaName) this.pendingSchemaNames.add(schemaName);
    const response = await fetch(
      `https://${this.workspace}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw new Error(`Memory direct HTTP ${response.status}`);
    const result = (response.status === 204 ? {} : await response.json()) as Result;
    if (schemaName) {
      const schemaId = (result as { profile_schema_id?: string }).profile_schema_id;
      if (!schemaId) throw new Error("Missing schema creation receipt");
      this.schemas.add(schemaId);
      this.pendingSchemaNames.delete(schemaName);
    }
    return result;
  }
  async nodes(): Promise<MemorySearchHit[]> {
    const nodes: MemorySearchHit[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const result = await this.request<{ memory_nodes?: MemorySearchHit[]; total?: number }>(
        "GET",
        `memory_nodes?user_id=${encodeURIComponent(this.userId)}&page_num=${page}&page_size=100`,
      );
      const rows = result.memory_nodes ?? [];
      nodes.push(...rows);
      for (const node of rows) if (node.memory_node_id) this.knownNodes.add(node.memory_node_id);
      if (result.total !== undefined ? nodes.length >= result.total : rows.length < 100)
        return nodes;
      if (!rows.length) throw new Error("Incomplete node pagination");
    }
    throw new Error("Node pagination exceeded limit");
  }
  private captureNodes(response: MemoryEventsResponse) {
    for (const event of response.events ?? []) {
      for (const result of event.result ?? []) {
        if (result.memory_node_id) this.knownNodes.add(result.memory_node_id);
      }
    }
  }
  async settle(eventId: string) {
    const result = await eventually(
      () => this.client.getEvent(eventId),
      (response) => classifyMemoryEvents(response.events ?? []).status !== "polling",
    );
    this.captureNodes(result);
    const classified = classifyMemoryEvents(result.events ?? []);
    if (classified.status === "failed") throw new Error("Cloud memory event failed");
    return classified;
  }
  async clearNodes() {
    for (const node of await this.nodes())
      if (node.memory_node_id) this.knownNodes.add(node.memory_node_id);
    for (const nodeId of this.knownNodes) {
      if (this.deletedNodes.has(nodeId)) continue;
      try {
        await this.client.deleteNode(nodeId);
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
      this.deletedNodes.add(nodeId);
    }
    await eventually(
      () => this.nodes(),
      (nodes) => nodes.length === 0,
    );
  }
  async finish(journey: string, passed: boolean) {
    const cleanupErrors: string[] = [];
    for (const event of this.events) {
      try {
        const result = await eventually(
          () => this.client.getEvent(event),
          (response) => classifyMemoryEvents(response.events ?? []).status !== "polling",
        );
        this.captureNodes(result);
      } catch {
        cleanupErrors.push("Event settlement failed");
      }
    }
    if (!cleanupErrors.length && this.userId) {
      try {
        await this.clearNodes();
      } catch {
        cleanupErrors.push("Synthetic user node cleanup failed");
      }
    }
    for (const schema of this.schemas) {
      try {
        await this.request("DELETE", `profile_schemas/${encodeURIComponent(schema)}`);
      } catch {
        cleanupErrors.push("Synthetic profile schema cleanup failed");
      }
    }
    if (this.pendingSchemaNames.size)
      cleanupErrors.push("Ambiguous schema creation receipt: reconciliation required");
    const directory = join(process.cwd(), "test", "output", "memory-plugin-journeys");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${journey}-${randomUUID()}.json`),
      JSON.stringify(
        {
          journey,
          layer: "real-cloud-controlled-host",
          passed: passed && cleanupErrors.length === 0,
          retainedTemporaryHome: cleanupErrors.length ? this.home : undefined,
          steps: this.steps,
          modelLayer: process.env.BAILIAN_MEMORY_CURATOR_MODEL
            ? "real-dashscope-via-test-adapter"
            : "not-invoked",
          blockers: this.blockers,
          cleanupErrors,
          userId: this.userId,
          events: [...this.events],
          schemas: [...this.schemas],
          pendingSchemaNames: [...this.pendingSchemaNames],
          knownNodes: [...this.knownNodes],
          deletedNodes: [...this.deletedNodes],
          eventCount: this.events.size,
          requests: this.requests,
        },
        null,
        2,
      ),
    );
    if (cleanupErrors.length) throw new Error(cleanupErrors.join("; "));
    await rm(this.home, { recursive: true, force: true });
  }

  async *stream(options: GenerateOptions) {
    this.modelCalls += 1;
    let text: string;
    if (process.env.BAILIAN_MEMORY_CURATOR_MODEL) {
      const messages = options.messages.map((message) => ({
        role: "user",
        content: message.content
          .filter((block) => block.type === "text")
          .map((block) => (block as { text: string }).text)
          .join("\n"),
      }));
      const response = await fetch(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: options.model,
            messages: [{ role: "system", content: options.system }, ...messages],
            max_tokens: 1024,
            enable_thinking: false,
          }),
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(90000)])
            : AbortSignal.timeout(90000),
        },
      );
      if (!response.ok) throw new Error(`Curator model HTTP ${response.status}`);
      const result = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      text = result.choices?.[0]?.message?.content ?? "";
      const decision = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
        action: string;
      };
      this.modelActions.push(decision.action);
    } else {
      throw new Error("Live curator model not configured");
    }
    yield { type: "block-end" as const, index: 0, block: { type: "text" as const, text } };
    yield { type: "finish" as const, reason: { kind: "stop" as const } };
  }
}

export function host(harness: CloudHarness, text: string) {
  const events: Array<{ type: string; seq: number; data: any }> = [
    { type: "turn/start", seq: 1, data: { turn: 1 } },
    { type: "user/message", seq: 2, data: { content: [{ type: "text", text }] } },
  ];
  const hooks = new Map<string, (...args: any[]) => Promise<any>>();
  const disposals: Array<() => void | Promise<void>> = [];
  const agent = {
    options: {},
    session: {
      id: randomUUID(),
      header: {},
      surface: { nodes: [] },
      snapshotEvents: () => events,
      append: (type: string, data: unknown) => events.push({ type, data, seq: events.length + 1 }),
    },
  } as unknown as Agent;
  const context = {
    on: (name: string, callback: (...args: any[]) => Promise<any>) => hooks.set(name, callback),
    get: (name: string) =>
      name === "approval" ? { request: async () => "allowed-once" } : undefined,
    effect: (create: () => () => void | Promise<void>) => disposals.push(create()),
    llm: { stream: (options: GenerateOptions) => harness.stream(options) },
  } as unknown as Context;
  return { context, agent, events, hooks, disposals };
}
