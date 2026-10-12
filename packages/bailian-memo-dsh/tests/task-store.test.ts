import { describe, expect, it, vi } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import {
  classifyMemoryEvents,
  InMemoryTaskStore,
  isStalePendingSubmission,
  openTaskStore,
  submitAddIntent,
  type MemoTaskRecord,
} from "../src/task-store.ts";
import type { MemoryClient } from "../src/memory-client.ts";

describe("task store idempotency", () => {
  it("detects interrupted submissions only after the grace period", () => {
    const record = {
      intentId: "intent-1",
      eventId: null,
      payloadDigest: "digest",
      status: "pending_submit" as const,
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
      attempts: 0,
      lastError: null,
      note: null,
    };
    expect(isStalePendingSubmission(record, Date.parse("2026-10-08T00:00:29.999Z"))).toBe(false);
    expect(isStalePendingSubmission(record, Date.parse("2026-10-08T00:00:30.000Z"))).toBe(true);
  });

  it("distinguishes terminal writes with changes from no-change events", () => {
    expect(
      classifyMemoryEvents([
        {
          resource_type: "observation",
          status: "SUCCEEDED",
          result: [{ event: "ADD", memory_node_id: "node-1" }],
        },
      ]),
    ).toEqual({
      status: "succeeded_with_change",
      resultCount: 1,
      resultEventTypes: ["ADD"],
      lastError: null,
    });

    expect(
      classifyMemoryEvents([
        { resource_type: "observation", status: "SUCCEEDED", result: [] },
        { resource_type: "user_profile", status: "UNRECORDED" },
      ]),
    ).toEqual({
      status: "succeeded_no_change",
      resultCount: 0,
      resultEventTypes: [],
      lastError: null,
    });
  });

  it("records a failed submission instead of leaving a pending task forever", async () => {
    const store = new InMemoryTaskStore();
    const client = {
      addAsync: vi.fn(async () => {
        throw new Error("service rejected request");
      }),
    } as unknown as MemoryClient;

    await expect(
      submitAddIntent({
        store,
        client,
        userId: "u1",
        messages: [{ role: "user", content: "remember this" }],
      }),
    ).rejects.toThrow("service rejected request");

    expect(await store.listRecent()).toMatchObject([
      {
        status: "failed",
        eventId: null,
        lastError: "service rejected request",
      },
    ]);
  });

  it("does not resubmit an already succeeded intent", async () => {
    const store = new InMemoryTaskStore();
    const addAsync = vi.fn(async () => ({ event_id: "evt-1" }));
    const client = { addAsync } as unknown as MemoryClient;
    const first = await submitAddIntent({
      store,
      client,
      userId: "u1",
      messages: [{ role: "user", content: "住杭州" }],
      note: "t1",
    });
    expect(first.eventId).toBe("evt-1");
    expect(addAsync).toHaveBeenCalledOnce();

    // Force succeeded then retry same payload lengths / note.
    await store.put({ ...first, status: "succeeded" });
    const second = await submitAddIntent({
      store,
      client,
      userId: "u1",
      messages: [{ role: "user", content: "住杭州" }],
      note: "t1",
    });
    expect(second.intentId).toBe(first.intentId);
    expect(addAsync).toHaveBeenCalledOnce();
  });

  it("does not collide when equal-length payloads contain different text", async () => {
    const store = new InMemoryTaskStore();
    const addAsync = vi
      .fn()
      .mockResolvedValueOnce({ event_id: "evt-1" })
      .mockResolvedValueOnce({ event_id: "evt-2" });
    const client = { addAsync } as unknown as MemoryClient;

    const first = await submitAddIntent({
      store,
      client,
      userId: "u1",
      messages: [{ role: "user", content: "杭州" }],
    });
    const second = await submitAddIntent({
      store,
      client,
      userId: "u1",
      messages: [{ role: "user", content: "北京" }],
    });

    expect(second.intentId).not.toBe(first.intentId);
    expect(addAsync).toHaveBeenCalledTimes(2);
  });

  it("uses the dsh Storage Domain synchronous-read/durable-put contract", async () => {
    const records = new Map<string, MemoTaskRecord>();
    const close = vi.fn(async () => undefined);
    const open = vi.fn(async () => ({
      table: () => ({
        get: (key: string) => records.get(key),
        entries: () => records.entries(),
        put: async (key: string, value: MemoTaskRecord) => {
          records.set(key, value);
        },
      }),
      close,
    }));
    const effects: Array<() => void | Promise<void>> = [];
    const ctx = {
      storageDomain: { open },
      effect: (register: () => () => void | Promise<void>) => {
        effects.push(register());
      },
    } as unknown as Context;

    const store = await openTaskStore(ctx);
    const record: MemoTaskRecord = {
      intentId: "intent-1",
      eventId: null,
      payloadDigest: "digest",
      status: "pending_submit",
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
      attempts: 0,
      lastError: null,
      note: null,
    };
    await store.put(record);

    expect(await store.get(record.intentId)).toEqual(record);
    expect(await store.listOpen()).toEqual([record]);
    expect(open).toHaveBeenCalledOnce();
    await effects[0]?.();
    expect(close).toHaveBeenCalledOnce();
  });
});

it("gates extraction and resolves a fresh schema for each new write", async () => {
  const store = new InMemoryTaskStore();
  const getProfileSchemaId = vi
    .fn()
    .mockResolvedValueOnce("schema-one")
    .mockResolvedValueOnce("schema-two");
  const addAsync = vi.fn(async (_input: Parameters<MemoryClient["addAsync"]>[0]) => ({
    event_id: "event",
  }));
  const client = { getProfileSchemaId, addAsync } as unknown as MemoryClient;
  const input = {
    store,
    client,
    userId: "user",
    messages: [{ role: "user" as const, content: "A fact" }],
  };
  await submitAddIntent({ ...input, extractProfile: false, note: "off" });
  expect(getProfileSchemaId).not.toHaveBeenCalled();
  expect(addAsync.mock.calls[0]?.[0]).toMatchObject({ profileSchema: undefined });
  await submitAddIntent({ ...input, extractProfile: true, note: "first" });
  await submitAddIntent({ ...input, extractProfile: true, note: "second" });
  expect(getProfileSchemaId).toHaveBeenCalledTimes(2);
  expect(addAsync.mock.calls[1]?.[0]).toMatchObject({ profileSchema: "schema-one" });
  expect(addAsync.mock.calls[2]?.[0]).toMatchObject({ profileSchema: "schema-two" });
  await submitAddIntent({ ...input, extractProfile: true, note: "second" });
  expect(getProfileSchemaId).toHaveBeenCalledTimes(2);
});

it("records missing profile rule as failure without silently submitting a different request", async () => {
  const store = new InMemoryTaskStore();
  const addAsync = vi.fn();
  const client = { getProfileSchemaId: async () => undefined, addAsync } as unknown as MemoryClient;
  await expect(
    submitAddIntent({
      store,
      client,
      userId: "user",
      messages: [{ role: "user", content: "A fact" }],
      extractProfile: true,
    }),
  ).rejects.toThrow(/No existing profile rule/);
  expect(addAsync).not.toHaveBeenCalled();
  expect(await store.listRecent()).toMatchObject([{ status: "failed" }]);
});

it("passes only the selected profile rule and treats a changed selection as a new intent", async () => {
  const store = new InMemoryTaskStore();
  const getProfileSchemaId = vi.fn(async (selected: string) => selected);
  const addAsync = vi.fn(async (_input: Parameters<MemoryClient["addAsync"]>[0]) => ({
    event_id: "event",
  }));
  const client = { getProfileSchemaId, addAsync } as unknown as MemoryClient;
  const input = {
    store,
    client,
    userId: "user",
    messages: [{ role: "user" as const, content: "A fact" }],
    extractProfile: true,
  };
  await submitAddIntent({ ...input, profileSchemaId: "chosen-one" });
  await submitAddIntent({ ...input, profileSchemaId: "chosen-two" });
  expect(getProfileSchemaId.mock.calls).toEqual([["chosen-one"], ["chosen-two"]]);
  expect(addAsync.mock.calls.map(([request]) => request.profileSchema)).toEqual([
    "chosen-one",
    "chosen-two",
  ]);
});
