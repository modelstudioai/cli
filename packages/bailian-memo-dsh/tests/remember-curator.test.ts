import { beforeEach, expect, it, vi } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ResolvedConfig } from "../src/config.js";
import type { MemoryClient } from "../src/memory-client.js";
import { createMemoTools } from "../src/tools.js";
import { installAuxiliaryCurator } from "../src/curator.js";
import { InMemoryTaskStore } from "../src/task-store.js";
import { emptyPersonalMemoryConfig } from "../src/personal-config.js";

vi.mock("node:os", () => ({
  homedir: () => {
    throw new Error("Real home forbidden");
  },
}));
vi.mock("../src/personal-config.js", async (original) => ({
  ...(await original<typeof import("../src/personal-config.js")>()),
  readPersonalMemoryConfig: async () => personal,
}));
const personal = {
  ...emptyPersonalMemoryConfig(),
  status: "active" as const,
  user_id: "test-user",
  workspace_id: "test-workspace",
  consented_at: "2026-01-01",
};
const config = {
  enabled: true,
  autoCurate: true,
  extractProfile: false,
  curatorTimeoutMs: 1000,
} as ResolvedConfig;
let events: Array<{ type: string; seq: number; data: unknown }>;
let stop: (input: { agent: Agent; turn: number; signal: AbortSignal }) => Promise<void>;
const stream = vi.fn();
const addAsync = vi.fn();
const client = { addAsync } as unknown as MemoryClient;
const context = {
  on: (_name: string, handler: typeof stop) => {
    stop = handler;
  },
  get: () => undefined,
  llm: { stream },
} as unknown as Context;
let agent: Agent;
let store: InMemoryTaskStore;
beforeEach(() => {
  vi.clearAllMocks();
  events = [
    { type: "turn/start", seq: 1, data: { turn: 1 } },
    {
      type: "user/message",
      seq: 2,
      data: { content: [{ type: "text", text: "请记住我喜欢绿茶" }] },
    },
  ];
  agent = {
    options: { provider: "test-provider", model: "test-model" },
    session: {
      id: "test-session",
      header: {},
      snapshotEvents: () => events,
      append: (type: string, data: unknown) => {
        events.push({ type, data, seq: events.length + 1 });
      },
    },
  } as unknown as Agent;
  store = new InMemoryTaskStore();
  addAsync.mockResolvedValue({ event_id: "event-one" });
  stream.mockImplementation(async function* () {
    yield {
      type: "block-end",
      index: 0,
      block: {
        type: "text",
        text: JSON.stringify({ action: "commit", quotes: ["我住杭州"], memoryText: "用户住杭州" }),
      },
    };
    yield { type: "finish", reason: { kind: "stop" } };
  });
  installAuxiliaryCurator(context, {
    client,
    store,
    resolveConfig: () => config,
    readConfig: async () => personal,
  });
});
async function remember() {
  const tool = createMemoTools({
    ctx: context,
    client,
    store,
    resolveConfig: () => config,
  }).remember;
  return (
    tool as unknown as {
      execute: (args: { text: string }, execution: { agent: Agent }) => Promise<unknown>;
    }
  ).execute({ text: "我喜欢绿茶" }, { agent });
}
it("skips automatic curation after an explicit remember in the same turn", async () => {
  await remember();
  await stop({ agent, turn: 1, signal: new AbortController().signal });
  expect(addAsync).toHaveBeenCalledTimes(1);
  expect(events).toContainEqual(
    expect.objectContaining({
      type: "bailian-memo/curator-finished",
      data: { turn: 1, committed: false, reason: "explicit remember already submitted" },
    }),
  );
  expect(stream).not.toHaveBeenCalled();
});
it("does not suppress the next turn", async () => {
  await remember();
  events.push(
    { type: "turn/start", seq: 4, data: { turn: 2 } },
    { type: "user/message", seq: 5, data: { content: [{ type: "text", text: "我住杭州" }] } },
  );
  await stop({ agent, turn: 2, signal: new AbortController().signal });
  expect(events.at(-1)?.data).toEqual({ turn: 2, committed: true });
  expect(stream).toHaveBeenCalledTimes(1);
  expect(addAsync).toHaveBeenCalledTimes(2);
  expect(addAsync).toHaveBeenLastCalledWith({
    userId: "test-user",
    messages: [{ role: "user", content: "用户住杭州" }],
    profileSchema: undefined,
  });
});
it("does not mark failed submissions as remembered", async () => {
  addAsync.mockRejectedValue(new Error("submission failed"));
  await expect(remember()).rejects.toThrow("submission failed");
  expect(events.some((event) => event.type === "bailian-memo/remember-submitted")).toBe(false);
});

it("does not mark a response without an event id as remembered", async () => {
  addAsync.mockResolvedValue({});
  await remember();
  expect(events.some((event) => event.type === "bailian-memo/remember-submitted")).toBe(false);
});
