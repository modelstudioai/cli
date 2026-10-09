import { describe, expect, it, vi } from "vite-plus/test";
import { initializeConfiguration, requireWorkspace } from "../src/configuration.js";

function harness(initial: Record<string, unknown> = {}, credentials: Record<string, string> = {}) {
  const state = { ...initial };
  const update = vi.fn(async (patch: Record<string, unknown>) => {
    Object.assign(state, patch);
  });
  const resolve = vi.fn(async (reference: string) => credentials[reference]);
  const set = vi.fn(async (reference: string, value: string) => {
    credentials[reference] = value;
  });
  const readSeed = vi.fn(() => ({ apiKey: "bl-key", workspaceId: "bl-workspace" }));
  return { state, update, resolve, set, readSeed, read: () => state };
}

describe("KB configuration ownership", () => {
  it("imports defaults into settings once and preserves explicit dsh values", async () => {
    const deps = harness(
      { workspaceId: "dsh-workspace" },
      { BAILIAN_KB_API_KEY: "dsh-key", BAILIAN_DEFAULT_CHAT_AGENT_ID: "legacy-chat" },
    );
    await initializeConfiguration(deps);
    expect(deps.state).toMatchObject({
      workspaceId: "dsh-workspace",
      defaultChatAgentId: "legacy-chat",
      configInitialized: true,
    });
    expect(deps.set).not.toHaveBeenCalled();
    deps.state.workspaceId = "";
    deps.state.defaultChatAgentId = "";
    await initializeConfiguration(deps);
    expect(deps.state.workspaceId).toBe("");
    expect(deps.state.defaultChatAgentId).toBe("");
    expect(() => requireWorkspace(deps.state.workspaceId as string)).toThrow(/Workspace/);
  });

  it("waits until imported credentials and settings are persisted", async () => {
    const deps = harness();
    await initializeConfiguration(deps);
    expect(deps.set).toHaveBeenCalledWith("BAILIAN_KB_API_KEY", "bl-key");
    expect(requireWorkspace(deps.state.workspaceId as string)).toBe("bl-workspace");
  });

  it("preserves an explicitly cleared field during migration", async () => {
    const deps = harness({ workspaceId: "" }, { BAILIAN_WORKSPACE_ID: "legacy" });
    await initializeConfiguration(deps);
    expect(deps.state.workspaceId).toBe("");
  });
});

it("never reads or overwrites the generic or memory credential", async () => {
  const credentials = { DASHSCOPE_API_KEY: "generic-key", BAILIAN_MEMO_API_KEY: "memo-key" };
  const deps = harness({ configInitialized: true, workspaceId: "kb-workspace" }, credentials);
  await initializeConfiguration(deps);
  expect(deps.resolve).toHaveBeenCalledExactlyOnceWith("BAILIAN_KB_API_KEY");
  expect(deps.set).toHaveBeenCalledExactlyOnceWith("BAILIAN_KB_API_KEY", "bl-key");
  expect(credentials.DASHSCOPE_API_KEY).toBe("generic-key");
  expect(credentials.BAILIAN_MEMO_API_KEY).toBe("memo-key");
  expect(deps.state.workspaceId).toBe("kb-workspace");
});
