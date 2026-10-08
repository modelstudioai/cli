import { describe, expect, it, vi } from "vite-plus/test";
import { applyCredentialAutofill, credentialSourceCategory } from "../src/credential-autofill.ts";

function callback() {
  return { apiKey: "callback-key", workspaceId: "ws-callback" };
}

describe("credential autofill", () => {
  it("rejects an inherited environment override before verifying or writing", async () => {
    const verify = vi.fn();
    const writeApiKey = vi.fn();
    const writePersonal = vi.fn();

    await expect(
      applyCredentialAutofill(callback(), {
        describeApiKey: async () => ({ configured: true, source: "env", writable: false }),
        resolveApiKey: async () => ({ value: "environment-key", source: "env" }),
        readPersonal: async () => ({ workspace_id: "ws-old" }),
        writeApiKey,
        writePersonal,
        verify,
      }),
    ).rejects.toThrow(/launching environment.*takes priority/i);

    expect(verify).not.toHaveBeenCalled();
    expect(writeApiKey).not.toHaveBeenCalled();
    expect(writePersonal).not.toHaveBeenCalled();
  });

  it("requires the callback key and Workspace as one consistent pair", async () => {
    const dependencies = {
      describeApiKey: async () => ({ configured: false, writable: true }),
      resolveApiKey: async () => undefined,
      readPersonal: async () => ({ workspace_id: "ws-old" }),
      writeApiKey: vi.fn(),
      writePersonal: vi.fn(),
      verify: vi.fn(),
    };

    await expect(applyCredentialAutofill({ apiKey: "callback-key" }, dependencies)).rejects.toThrow(
      /both an API key and Workspace/i,
    );
    await expect(
      applyCredentialAutofill({ workspaceId: "ws-callback" }, dependencies),
    ).rejects.toThrow(/both an API key and Workspace/i);
  });

  it("replaces both stored values then verifies the effective pair", async () => {
    const order: string[] = [];
    let effectiveKey = "old-key";
    const writeApiKey = vi.fn(async () => {
      order.push("key");
      effectiveKey = "callback-key";
    });
    const writePersonal = vi.fn(async (personal: { workspace_id: string | null }) => {
      order.push("workspace");
      expect(personal.workspace_id).toBe("ws-callback");
    });

    const fields = await applyCredentialAutofill(callback(), {
      describeApiKey: async () => ({ configured: true, source: "file", writable: true }),
      resolveApiKey: async () => ({ value: effectiveKey, source: "file" }),
      readPersonal: async () => ({ workspace_id: "ws-old" }),
      writeApiKey,
      writePersonal,
      verify: async (credentials) => {
        order.push("verify");
        expect(credentials).toEqual(callback());
      },
    });

    expect(fields).toEqual(["apiKey", "workspaceId"]);
    expect(order).toEqual(["key", "workspace", "verify"]);
  });

  it("restores the previous effective key if the Workspace write fails", async () => {
    const writeApiKey = vi.fn(async () => undefined);

    await expect(
      applyCredentialAutofill(callback(), {
        describeApiKey: async () => ({ configured: true, source: "file", writable: true }),
        resolveApiKey: async () => ({ value: "old-key", source: "file" }),
        readPersonal: async () => ({ workspace_id: "ws-old" }),
        writeApiKey,
        writePersonal: async () => {
          throw new Error("workspace write failed");
        },
        verify: async () => undefined,
      }),
    ).rejects.toThrow("workspace write failed");

    expect(writeApiKey).toHaveBeenNthCalledWith(1, "callback-key");
    expect(writeApiKey).toHaveBeenNthCalledWith(2, "old-key");
  });
});

describe("credentialSourceCategory", () => {
  it("maps effective dsh sources without exposing values", () => {
    expect(credentialSourceCategory("env")).toBe("environment");
    expect(credentialSourceCategory("file")).toBe("local");
    expect(credentialSourceCategory("project-env")).toBe("projectEnvironment");
    expect(credentialSourceCategory("user-env")).toBe("userEnvironment");
    expect(credentialSourceCategory(undefined)).toBeUndefined();
  });
});
