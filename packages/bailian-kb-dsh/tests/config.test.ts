import { describe, expect, it } from "vite-plus/test";
import { Config } from "../src/index.js";

describe("Config", () => {
  it("applies defaults and accepts a pinned workspaceId", () => {
    const resolved = new Config({ workspaceId: "ws-1" } as never);
    expect(resolved.workspaceId).toBe("ws-1");
    expect(resolved.endpointHost).toBe("cn-beijing.maas.aliyuncs.com");
    expect(resolved.chatTimeoutMs).toBe(300_000);
    expect(resolved.defaultRetrieveAgentId).toBeUndefined();
    expect(resolved.defaultChatAgentId).toBeUndefined();
  });

  it("accepts a missing workspaceId (per-call credentials fallback)", () => {
    const resolved = new Config({} as never);
    expect(resolved.workspaceId).toBeUndefined();
    expect(resolved.endpointHost).toBe("cn-beijing.maas.aliyuncs.com");
  });

  it("carries the bl-CLI seed ledger through validation", () => {
    const resolved = new Config({ seededFields: ["apiKey"] } as never);
    expect(resolved.seededFields).toEqual(["apiKey"]);
  });
});
