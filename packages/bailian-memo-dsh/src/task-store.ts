/**
 * Recoverable async add-async task polling via Storage Domain (when mounted).
 */

import { createHash } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import { defineDomain, domainTable, type Domain } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";
import type { MemoryClient, MemoryEventItem } from "./memory-client.js";

export type MemoTaskStatus =
  | "pending_submit"
  | "submitted"
  | "polling"
  | "succeeded_with_change"
  | "succeeded_no_change"
  /** Legacy status written before result-aware task diagnostics. */
  | "succeeded"
  | "failed"
  | "abandoned";

export interface MemoTaskRecord {
  intentId: string;
  eventId: string | null;
  payloadDigest: string;
  status: MemoTaskStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError: string | null;
  /** Optional short reason; never stores conversation text. */
  note: string | null;
  /** Number of node/profile changes reported by terminal events. */
  resultCount?: number;
  /** Sanitized event operations only; never contains memory content or node IDs. */
  resultEventTypes?: string[];
}

const taskRecordSchema = z
  .object({
    intentId: z.string().min(1),
    eventId: z.string().nullable(),
    payloadDigest: z.string().min(1),
    status: z.enum([
      "pending_submit",
      "submitted",
      "polling",
      "succeeded_with_change",
      "succeeded_no_change",
      "succeeded",
      "failed",
      "abandoned",
    ]),
    createdAt: z.string(),
    updatedAt: z.string(),
    attempts: z.number().int().nonnegative(),
    lastError: z.string().nullable(),
    note: z.string().nullable(),
    resultCount: z.number().int().nonnegative().optional(),
    resultEventTypes: z.array(z.string()).optional(),
  })
  .strict();

export const MEMO_TASK_DOMAIN_NAME = "bailian_memo_tasks";

/** In-memory fallback when storageDomain is unavailable. */
export class InMemoryTaskStore {
  private readonly records = new Map<string, MemoTaskRecord>();

  async put(record: MemoTaskRecord): Promise<void> {
    this.records.set(record.intentId, record);
  }

  async get(intentId: string): Promise<MemoTaskRecord | undefined> {
    return this.records.get(intentId);
  }

  async listOpen(): Promise<MemoTaskRecord[]> {
    return [...this.records.values()].filter(
      (record) =>
        record.status === "pending_submit" ||
        record.status === "submitted" ||
        record.status === "polling",
    );
  }

  async listRecent(limit = 20): Promise<MemoTaskRecord[]> {
    return [...this.records.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }
}

export interface TaskStore {
  put(record: MemoTaskRecord): Promise<void>;
  get(intentId: string): Promise<MemoTaskRecord | undefined>;
  listOpen(): Promise<MemoTaskRecord[]>;
  listRecent(limit?: number): Promise<MemoTaskRecord[]>;
}

export function payloadDigest(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24);
}

export function createIntentId(digest: string): string {
  return `intent_${digest}`;
}

const memoTaskDomainSpec = defineDomain({
  name: MEMO_TASK_DOMAIN_NAME,
  version: 1,
  layout: "per-record",
  invalidRecords: "backup-and-skip",
  tables: {
    tasks: domainTable<string, MemoTaskRecord>(taskRecordSchema),
  },
});

class DomainTaskStore implements TaskStore {
  private readonly table;

  constructor(private readonly domain: Domain<typeof memoTaskDomainSpec>) {
    this.table = domain.table("tasks");
  }

  async put(record: MemoTaskRecord): Promise<void> {
    await this.table.put(record.intentId, record);
  }

  async get(intentId: string): Promise<MemoTaskRecord | undefined> {
    return this.table.get(intentId);
  }

  async listOpen(): Promise<MemoTaskRecord[]> {
    return [...this.table.entries()]
      .map(([, record]) => record)
      .filter(
        (record) =>
          record.status === "pending_submit" ||
          record.status === "submitted" ||
          record.status === "polling",
      );
  }

  async listRecent(limit = 20): Promise<MemoTaskRecord[]> {
    return [...this.table.entries()]
      .map(([, record]) => record)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }
}

export async function openTaskStore(ctx: Context): Promise<TaskStore> {
  const domain = await ctx.storageDomain.open(memoTaskDomainSpec);
  ctx.effect(
    () => async () => {
      await domain.close();
    },
    "bailian-memo: task domain",
  );
  return new DomainTaskStore(domain);
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;
const PENDING_SUBMISSION_GRACE_MS = 30_000;

export function isStalePendingSubmission(record: MemoTaskRecord, nowMs = Date.now()): boolean {
  return (
    record.status === "pending_submit" &&
    record.eventId === null &&
    nowMs - Date.parse(record.updatedAt) >= PENDING_SUBMISSION_GRACE_MS
  );
}

export function classifyMemoryEvents(events: MemoryEventItem[]): {
  status: MemoTaskStatus;
  resultCount: number;
  resultEventTypes: string[];
  lastError: string | null;
} {
  const failedEvent = events.find((event) => event.status === "FAILED");
  const results = events.flatMap((event) => event.result ?? []);
  const resultEventTypes = [
    ...new Set(
      results
        .map((result) => result.event)
        .filter((event): event is NonNullable<typeof event> => event !== undefined),
    ),
  ];
  if (failedEvent) {
    return {
      status: "failed",
      resultCount: results.length,
      resultEventTypes,
      lastError: failedEvent.message ?? failedEvent.error ?? "FAILED",
    };
  }
  const terminalStatuses = new Set(["SUCCEEDED", "SUCCESS", "UNRECORDED"]);
  if (events.length > 0 && events.every((event) => terminalStatuses.has(event.status ?? ""))) {
    return {
      status: results.length > 0 ? "succeeded_with_change" : "succeeded_no_change",
      resultCount: results.length,
      resultEventTypes,
      lastError: null,
    };
  }
  return {
    status: "polling",
    resultCount: results.length,
    resultEventTypes,
    lastError: null,
  };
}

export function installTaskPoller(ctx: Context, store: TaskStore, client: MemoryClient): void {
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = async () => {
    const open = await store.listOpen();
    for (const record of open) {
      if (!record.eventId) {
        if (isStalePendingSubmission(record)) {
          await store.put({
            ...record,
            status: "failed",
            updatedAt: new Date().toISOString(),
            lastError: "add-async submission interrupted before event_id was persisted",
          });
        }
        continue;
      }
      if (record.attempts >= MAX_POLL_ATTEMPTS) {
        await store.put({
          ...record,
          status: "abandoned",
          updatedAt: new Date().toISOString(),
          lastError: "poll attempts exhausted",
        });
        continue;
      }
      try {
        const response = await client.getEvent(record.eventId);
        const events = response.events ?? [];
        const classified = classifyMemoryEvents(events);
        await store.put({
          ...record,
          status: classified.status,
          attempts: record.attempts + 1,
          updatedAt: new Date().toISOString(),
          lastError: classified.lastError,
          resultCount: classified.resultCount,
          resultEventTypes: classified.resultEventTypes,
        });
      } catch (error) {
        await store.put({
          ...record,
          status: "polling",
          attempts: record.attempts + 1,
          updatedAt: new Date().toISOString(),
          lastError: error instanceof Error ? error.message : "poll failed",
        });
      }
    }
  };

  timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  // Recover open tasks shortly after mount.
  void tick();
  ctx.effect(
    () => () => {
      if (timer) clearInterval(timer);
    },
    "bailian-memo: task poller",
  );
}

export async function submitAddIntent(input: {
  store: TaskStore;
  client: MemoryClient;
  userId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  extractProfile?: boolean;
  profileSchemaId?: string;
  note?: string;
}): Promise<MemoTaskRecord> {
  const digest = payloadDigest({
    userId: input.userId,
    messages: input.messages,
    extractProfile: input.extractProfile === true,
    profileSchemaId: input.extractProfile ? (input.profileSchemaId ?? null) : null,
    note: input.note ?? null,
  });
  const intentId = createIntentId(digest);
  const existing = await input.store.get(intentId);
  if (
    existing &&
    (existing.status === "submitted" ||
      existing.status === "polling" ||
      existing.status === "succeeded_with_change" ||
      existing.status === "succeeded_no_change" ||
      existing.status === "succeeded")
  ) {
    return existing;
  }
  const now = new Date().toISOString();
  const pending: MemoTaskRecord = {
    intentId,
    eventId: null,
    payloadDigest: digest,
    status: "pending_submit",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    attempts: existing?.attempts ?? 0,
    lastError: null,
    note: input.note ?? null,
  };
  await input.store.put(pending);
  let submission;
  try {
    const profileSchema = input.extractProfile
      ? await input.client.getProfileSchemaId(input.profileSchemaId)
      : undefined;
    if (input.extractProfile && !profileSchema) {
      throw new Error(
        "No existing profile rule found. Configure one in the memory console. / 未找到已有画像规则，请在记忆库控制台配置。",
      );
    }
    submission = await input.client.addAsync({
      userId: input.userId,
      messages: input.messages,
      profileSchema,
    });
  } catch (error) {
    await input.store.put({
      ...pending,
      status: "failed",
      updatedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "add-async submission failed",
    });
    throw error;
  }
  const submitted: MemoTaskRecord = {
    ...pending,
    eventId: submission.event_id ?? null,
    status: submission.event_id ? "submitted" : "failed",
    updatedAt: new Date().toISOString(),
    lastError: submission.event_id ? null : "add-async returned no event_id",
  };
  await input.store.put(submitted);
  return submitted;
}
