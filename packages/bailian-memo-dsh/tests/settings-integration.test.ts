import { beforeEach, expect, it, vi } from "vite-plus/test";
import { Context } from "@deepseek-ai/cordis";
import { apply } from "../src/index.js";
import type { Config } from "../src/config.js";
import { emptyPersonalMemoryConfig } from "../src/personal-config.js";
import { MemoryClient } from "../src/memory-client.js";

const state = vi.hoisted(() => ({
  personal: { workspace_id: "bound" },
  seed: { workspaceId: "bl-workspace", apiKey: "bl-key" },
  client: undefined as MemoryClient | undefined,
  readBl: vi.fn(),
}));
vi.mock("../src/bl-cli.js", () => ({
  readBlCliConfig: () => {
    state.readBl();
    return state.seed;
  },
}));
vi.mock("../src/personal-config.js", async (original) => ({
  ...(await original<typeof import("../src/personal-config.js")>()),
  readPersonalMemoryConfig: async () => state.personal,
}));
vi.mock("../src/initialize.js", () => ({
  ensureInitialized: vi.fn(),
  resumeAndEnsure: async () => undefined,
}));
vi.mock("../src/recall.js", () => ({ installAutomaticRecall: vi.fn() }));
vi.mock("../src/curator.js", () => ({ installAuxiliaryCurator: vi.fn() }));
vi.mock("../src/task-store.js", () => ({
  installTaskPoller: vi.fn(),
  openTaskStore: async () => ({}),
}));
vi.mock("../src/tools.js", () => ({
  registerMemoTools: (_ctx: unknown, options: { client: MemoryClient }) => {
    state.client = options.client;
  },
}));

beforeEach(() => {
  state.personal = { ...emptyPersonalMemoryConfig(), workspace_id: "bound" };
  state.readBl.mockClear();
  state.client = undefined;
});

it("persists migration once and requests read live dsh settings without bl fallback", async () => {
  const values: Record<string, unknown> = { configInitialized: false };
  const config = Object.fromEntries(
    [
      "workspaceId",
      "configInitialized",
      "enabled",
      "autoRecall",
      "autoCurate",
      "recallTopK",
      "minScore",
      "curatorMaxOutputTokens",
      "curatorTimeoutMs",
      "curatorProvider",
      "curatorModel",
    ].map((field) => [field, { get: () => values[field] }]),
  ) as unknown as Config;
  const root = new Context();
  let pluginContext: Context;
  const update = vi.fn(async (_namespace: string, patch: object) => {
    if (pluginContext.fiber.state !== 2)
      throw new Error("Plugin entry is not configurable while loading");
    Object.assign(values, patch);
  });
  root.provide("settings", { configure: () => () => undefined, update });
  root.provide("credentials", {
    resolve: async (reference: string) => {
      expect(reference).toBe("BAILIAN_MEMO_API_KEY");
      return { value: "dsh-key" };
    },
    set: vi.fn(),
  });
  root.provide("sessionProjections", { register: vi.fn() });
  root.provide("webServer", { register: () => () => undefined });
  const start = (ctx: Context) => {
    pluginContext = ctx;
    return apply(ctx, config);
  };
  const fiber = await root.plugin(start);
  await vi.waitFor(() => expect(state.client).toBeDefined());
  expect(update).toHaveBeenCalledWith("tool-bailian-memo", {
    workspaceId: "bound",
    configInitialized: true,
  });
  root.emit("internal/status", fiber, 1);
  expect(update).toHaveBeenCalledTimes(1);
  values.workspaceId = "different";
  await expect(state.client!.list({ userId: "user" })).rejects.toThrow(/mismatch/);
  values.workspaceId = undefined;
  await expect(state.client!.list({ userId: "user" })).rejects.toThrow(/dsh settings/);
  expect(state.readBl).toHaveBeenCalledTimes(1);
  update.mockClear();
  await fiber.dispose();
  state.client = undefined;
  const restarted = await root.plugin(start);
  await vi.waitFor(() => expect(state.client).toBeDefined());
  expect(update).not.toHaveBeenCalled();
  await restarted.dispose();
});

it("does not register consumers after disposal during the settings write", async () => {
  const root = new Context();
  let completeWrite!: () => void;
  const update = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        completeWrite = resolve;
      }),
  );
  const resolveKey = vi.fn(async () => ({ value: "dsh-key" }));
  root.provide("settings", { configure: () => () => undefined, update });
  root.provide("credentials", { resolve: resolveKey, set: vi.fn() });
  const config = {
    configInitialized: { get: () => false },
    workspaceId: { get: () => undefined },
  } as unknown as Config;
  const fiber = await root.plugin((ctx) => apply(ctx, config));
  await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  await fiber.dispose();
  completeWrite();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(resolveKey).not.toHaveBeenCalled();
  expect(state.client).toBeUndefined();
});

it("manual credential route validates, persists the pair, rejects mismatches and never returns secrets", async () => {
  const root = new Context();
  const routes = new Map<string, (request: unknown, response: unknown) => Promise<void>>();
  let key = "old-secret";
  let workspace = "bound";
  const setKey = vi.fn(async (_reference: unknown, value: string) => {
    key = value;
  });
  const update = vi.fn(async (_namespace: string, patch: { workspaceId: string }) => {
    workspace = patch.workspaceId;
  });
  root.provide("settings", { configure: () => () => undefined, update });
  root.provide("credentials", {
    describe: async () => ({ configured: true, writable: true }),
    resolve: async (reference: string) => {
      expect(reference).toBe("BAILIAN_MEMO_API_KEY");
      return { value: key, source: "file" };
    },
    set: setKey,
  });
  root.provide("sessionProjections", { register: vi.fn() });
  root.provide("webServer", {
    register: (route: {
      path: string;
      handler: (request: unknown, response: unknown) => Promise<void>;
    }) => {
      routes.set(route.path, route.handler);
      return () => routes.delete(route.path);
    },
  });
  root.provide("connection", { requestRejection: () => undefined });
  const config = {
    configInitialized: { get: () => true },
    workspaceId: { get: () => workspace },
  } as unknown as Config;
  const fiber = await root.plugin((ctx) => apply(ctx, config));
  await vi.waitFor(() => expect(routes.has("/plugins/bailian-memo-dsh/credentials")).toBe(true));
  const verify = vi.spyOn(MemoryClient.prototype, "list").mockImplementation(async () => {
    expect(setKey).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    return {};
  });
  const invoke = async (body: object) => {
    let result = "";
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: (value: string) => {
        result = value;
      },
    };
    const request = {
      method: "POST",
      headers: {},
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify(body);
      },
    };
    await routes.get("/plugins/bailian-memo-dsh/credentials")!(request, response);
    return { status: response.statusCode, result };
  };
  try {
    expect(await invoke({ apiKey: "new-secret", workspaceId: "bound" })).toEqual({
      status: 200,
      result: JSON.stringify({ updated: ["apiKey", "workspaceId"] }),
    });
    expect(key).toBe("new-secret");
    expect(setKey).toHaveBeenCalledWith("BAILIAN_MEMO_API_KEY", "new-secret");
    expect(update).toHaveBeenCalledWith(
      "tool-bailian-memo",
      expect.objectContaining({ workspaceId: "bound" }),
    );
    setKey.mockClear();
    update.mockClear();
    expect((await invoke({ apiKey: "", workspaceId: "other" })).status).toBe(400);
    expect(setKey).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    verify.mockRejectedValueOnce(new Error("rejected leaked-secret new-secret"));
    const rejected = await invoke({ apiKey: "leaked-secret", workspaceId: "bound" });
    expect(rejected.status).toBe(400);
    expect(rejected.result).not.toContain("leaked-secret");
    expect(rejected.result).not.toContain("new-secret");
    expect(setKey).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  } finally {
    verify.mockRestore();
    await fiber.dispose();
  }
});
