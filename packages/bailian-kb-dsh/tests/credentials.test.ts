import { describe, expect, it, vi } from "vite-plus/test";
import { saveConnection } from "../src/credentials.js";

function dependencies() {
  let key: string | undefined = "old-key";
  let workspace = "old-workspace";
  return {
    describe: async () => ({ writable: true }),
    resolve: async () => key,
    readWorkspace: () => workspace,
    writeKey: vi.fn(async (value: string) => {
      key = value;
    }),
    unsetKey: vi.fn(async () => {
      key = undefined;
    }),
    writeWorkspace: vi.fn(async (value: string) => {
      workspace = value;
    }),
    verify: vi.fn(async (_apiKey: string, _workspace: string) => undefined),
  };
}

describe("manual connection updates", () => {
  it("verifies the candidate pair before persisting key and workspace", async () => {
    const deps = dependencies();
    deps.verify.mockImplementation(async (key, workspace) => {
      expect([key, workspace]).toEqual(["new-key", "new-workspace"]);
      expect(deps.writeKey).not.toHaveBeenCalled();
      expect(deps.writeWorkspace).not.toHaveBeenCalled();
    });
    await saveConnection({ apiKey: " new-key ", workspaceId: " new-workspace " }, deps);
    expect(await deps.resolve()).toBe("new-key");
    expect(deps.readWorkspace()).toBe("new-workspace");
  });
  it("retains the current key for a blank draft including an environment-owned key", async () => {
    const deps = dependencies();
    deps.describe = async () => ({ writable: false });
    await saveConnection({ apiKey: "", workspaceId: "new-workspace" }, deps);
    expect(deps.writeKey).not.toHaveBeenCalled();
    expect(deps.verify).toHaveBeenCalledWith("old-key", "new-workspace");
  });
  it("rejects replacement of an environment-owned key before any writes", async () => {
    const deps = dependencies();
    deps.describe = async () => ({ writable: false });
    await expect(
      saveConnection({ apiKey: "new-key", workspaceId: "new-workspace" }, deps),
    ).rejects.toThrow(/environment/);
    expect(deps.writeKey).not.toHaveBeenCalled();
  });
  it("does not save an invalid pair or leak either key in the error", async () => {
    const deps = dependencies();
    deps.verify.mockRejectedValue(new Error("denied new-key old-key"));
    await expect(
      saveConnection({ apiKey: "new-key", workspaceId: "new-workspace" }, deps),
    ).rejects.toThrow("denied [redacted] [redacted]");
    expect(deps.writeKey).not.toHaveBeenCalled();
    expect(deps.writeWorkspace).not.toHaveBeenCalled();
  });
  it("restores the prior key when workspace persistence fails", async () => {
    const deps = dependencies();
    deps.writeWorkspace.mockRejectedValueOnce(new Error("settings unavailable"));
    await expect(
      saveConnection({ apiKey: "new-key", workspaceId: "new-workspace" }, deps),
    ).rejects.toThrow();
    expect(await deps.resolve()).toBe("old-key");
    expect(deps.readWorkspace()).toBe("old-workspace");
  });
});
