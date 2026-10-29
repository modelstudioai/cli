import { describe, expect, it } from "vite-plus/test";
import { Config } from "../src/index.js";

describe("Config", () => {
  it("applies defaults and accepts a pinned workspaceId", () => {
    const resolved = new Config({ workspaceId: "ws-1" } as never);
    expect(resolved.workspaceId.get()).toBe("ws-1");
    expect("endpointHost" in resolved).toBe(false);
    expect(resolved.chatTimeoutMs.get()).toBe(300_000);
    expect(resolved.defaultRetrieveAgentId.get()).toBeUndefined();
    expect(resolved.defaultChatAgentId.get()).toBeUndefined();
  });

  it("accepts a missing workspaceId (settings page required)", () => {
    const resolved = new Config({} as never);
    expect(resolved.workspaceId.get()).toBeUndefined();
    expect("endpointHost" in resolved).toBe(false);
  });
});
