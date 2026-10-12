import { Context } from "@deepseek-ai/cordis";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { apply, type Config } from "../src/index.js";
import type { KbClientOptions } from "../src/client.js";

const state = vi.hoisted(() => ({
  client: undefined as KbClientOptions | undefined,
  seed: vi.fn(() => ({ apiKey: "bl-key", workspaceId: "bl-ws" })),
}));
vi.mock("../src/bl-cli.js", () => ({ readBlCliConfig: state.seed }));
vi.mock("../src/client.js", async (original) => ({
  ...(await original<typeof import("../src/client.js")>()),
  KbClient: class {
    constructor(options: KbClientOptions) {
      state.client = options;
    }
  },
}));
vi.mock("../src/skill.js", () => ({ registerSkill: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it("awaits initialization and then reads only live dsh settings and credentials", async () => {
  const values: Record<string, unknown> = {};
  const config = Object.fromEntries(
    [
      "workspaceId",
      "configInitialized",
      "defaultRetrieveAgentId",
      "defaultChatAgentId",
      "agentVersion",
      "chatTimeoutMs",
    ].map((field) => [field, { get: () => values[field] }]),
  ) as unknown as Config;
  let finishPersistence: (() => void) | undefined;
  const persistence = new Promise<void>((resolve) => {
    finishPersistence = resolve;
  });
  const update = vi.fn(async (_namespace: string, patch: object) => {
    expect(fiber.state).toBe(2);
    await persistence;
    Object.assign(values, patch);
  });
  const credentials: Record<string, string> = {
    BAILIAN_KB_API_KEY: "dsh-key",
    BAILIAN_WORKSPACE_ID: "legacy-ws",
  };
  const register = vi.fn();
  const fiber = { state: 1 };
  let onStatus: (() => void) | undefined;
  const ctx = {
    fiber,
    logger: { error: vi.fn() },
    get: () => ({ configure: () => () => undefined, update }),
    effect: vi.fn(),
    inject: vi.fn(),
    on: (event: string, callback: (fiber: unknown) => void) => {
      if (event === "internal/status") onStatus = () => callback(fiber);
    },
    tools: { register },
    credentials: {
      resolve: async (reference: string) =>
        credentials[reference] ? { value: credentials[reference] } : undefined,
      set: vi.fn(),
    },
  } as unknown as Context;
  apply(ctx, config);
  expect(update).not.toHaveBeenCalled();
  fiber.state = 2;
  onStatus!();
  await vi.waitFor(() => expect(update).toHaveBeenCalled());
  expect(register).not.toHaveBeenCalled();
  finishPersistence!();
  await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(3));
  expect(await state.client!.resolveWorkspaceId()).toBe("legacy-ws");
  values.workspaceId = "dsh-edited";
  credentials.BAILIAN_KB_API_KEY = "rotated-key";
  credentials.BAILIAN_WORKSPACE_ID = "ignored-legacy-edit";
  expect(await state.client!.resolveWorkspaceId()).toBe("dsh-edited");
  expect(await state.client!.resolveApiKey()).toBe("rotated-key");
  expect(state.client!.endpointHost).toBe("cn-beijing.maas.aliyuncs.com");
  values.workspaceId = "";
  await expect(state.client!.resolveWorkspaceId()).rejects.toThrow(/Workspace/);
  expect(state.seed).toHaveBeenCalledTimes(1);
});

it("runs migration after an actual Cordis fiber becomes active", async () => {
  const root = new Context();
  const values: Record<string, unknown> = {};
  const config = Object.fromEntries(
    [
      "workspaceId",
      "configInitialized",
      "defaultRetrieveAgentId",
      "defaultChatAgentId",
      "agentVersion",
      "chatTimeoutMs",
    ].map((field) => [field, { get: () => values[field] }]),
  ) as unknown as Config;
  const register = vi.fn();
  const update = vi.fn(async (_namespace: string, patch: object) => {
    expect(plugin.state).toBe(2);
    Object.assign(values, patch);
  });
  root.provide("settings", { configure: () => () => undefined, update });
  root.provide("credentials", { resolve: async () => ({ value: "dsh-value" }), set: vi.fn() });
  root.provide("tools", { register });
  const plugin = root.plugin((ctx) => apply(ctx, config));
  try {
    await plugin.await();
    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(3));
    expect(update).toHaveBeenCalledOnce();
  } finally {
    await plugin.dispose();
  }
});
