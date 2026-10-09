import { describe, expect, it, vi } from "vite-plus/test";
import {
  applyConnectionSettings,
  applyCredentialAutofill,
  credentialSourceCategory,
} from "../src/credential-autofill.ts";

function callback() {
  return { apiKey: "callback-key", workspaceId: "ws-callback" };
}

describe("credential autofill", () => {
  it("rejects an inherited environment override before verifying or writing", async () => {
    const verify = vi.fn();
    const writeApiKey = vi.fn();
    const writeWorkspace = vi.fn();

    await expect(
      applyCredentialAutofill(callback(), {
        describeApiKey: async () => ({ configured: true, source: "env", writable: false }),
        resolveApiKey: async () => ({ value: "environment-key", source: "env" }),
        readPersonal: async () => ({ workspace_id: null }),
        readWorkspace: () => "ws-old",
        writeApiKey,
        writeWorkspace,
        verify,
      }),
    ).rejects.toThrow(/launching environment.*takes priority/i);

    expect(verify).not.toHaveBeenCalled();
    expect(writeApiKey).not.toHaveBeenCalled();
    expect(writeWorkspace).not.toHaveBeenCalled();
  });

  it("requires the callback key and Workspace as one consistent pair", async () => {
    const dependencies = {
      describeApiKey: async () => ({ configured: false, writable: true }),
      resolveApiKey: async () => undefined,
      readPersonal: async () => ({ workspace_id: null }),
      readWorkspace: () => "ws-old",
      writeApiKey: vi.fn(),
      writeWorkspace: vi.fn(),
      verify: vi.fn(),
    };

    await expect(applyCredentialAutofill({ apiKey: "callback-key" }, dependencies)).rejects.toThrow(
      /both an API key and Workspace/i,
    );
    await expect(
      applyCredentialAutofill({ workspaceId: "ws-callback" }, dependencies),
    ).rejects.toThrow(/both an API key and Workspace/i);
  });

  it("rejects a callback Workspace that differs from the existing identity", async () => {
    const writeApiKey = vi.fn();
    const writeWorkspace = vi.fn();
    await expect(
      applyCredentialAutofill(callback(), {
        describeApiKey: async () => ({ configured: true, writable: true }),
        resolveApiKey: async () => ({ value: "old-key", source: "file" }),
        readPersonal: async () => ({ workspace_id: "bound-workspace" }),
        readWorkspace: () => "bound-workspace",
        writeApiKey,
        writeWorkspace,
        verify: vi.fn(),
      }),
    ).rejects.toThrow(/workspace.*mismatch/i);
    expect(writeApiKey).not.toHaveBeenCalled();
    expect(writeWorkspace).not.toHaveBeenCalled();
  });

  it("verifies the candidate pair before replacing stored values", async () => {
    const order: string[] = [];
    let effectiveKey = "old-key";
    const writeApiKey = vi.fn(async () => {
      order.push("key");
      effectiveKey = "callback-key";
    });
    const writeWorkspace = vi.fn(async (workspaceId: string | undefined) => {
      order.push("workspace");
      expect(workspaceId).toBe("ws-callback");
    });

    const fields = await applyCredentialAutofill(callback(), {
      describeApiKey: async () => ({ configured: true, source: "file", writable: true }),
      resolveApiKey: async () => ({ value: effectiveKey, source: "file" }),
      readPersonal: async () => ({ workspace_id: null }),
      readWorkspace: () => "ws-old",
      writeApiKey,
      writeWorkspace,
      verify: async (credentials) => {
        order.push("verify");
        expect(credentials).toEqual(callback());
      },
    });

    expect(fields).toEqual(["apiKey", "workspaceId"]);
    expect(order).toEqual(["verify", "key", "workspace"]);
  });

  it("rolls back dsh values when verification fails without changing identity", async () => {
    let effectiveKey = "old-key";
    let workspaceId: string | undefined = "old-workspace";
    const personal = { workspace_id: null };
    await expect(
      applyCredentialAutofill(callback(), {
        describeApiKey: async () => ({ configured: true, source: "file", writable: true }),
        resolveApiKey: async () => ({ value: effectiveKey, source: "file" }),
        readPersonal: async () => personal,
        readWorkspace: () => workspaceId,
        writeApiKey: async (value) => {
          effectiveKey = value;
        },
        writeWorkspace: async (value) => {
          workspaceId = value;
        },
        verify: async () => {
          throw new Error("service rejected pair");
        },
      }),
    ).rejects.toThrow("service rejected pair");
    expect(effectiveKey).toBe("old-key");
    expect(workspaceId).toBe("old-workspace");
    expect(personal.workspace_id).toBeNull();
  });

  it("restores the previous effective key if the Workspace write fails", async () => {
    const writeApiKey = vi.fn(async () => undefined);

    await expect(
      applyCredentialAutofill(callback(), {
        describeApiKey: async () => ({ configured: true, source: "file", writable: true }),
        resolveApiKey: async () => ({ value: "old-key", source: "file" }),
        readPersonal: async () => ({ workspace_id: null }),
        readWorkspace: () => "ws-old",
        writeApiKey,
        writeWorkspace: async () => {
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

describe("manual connection settings", () => {
  it("retains the effective environment key when the new key is blank", async () => {
    const writeApiKey = vi.fn();
    const writeWorkspace = vi.fn();
    const verify = vi.fn();
    expect(
      await applyConnectionSettings(
        { apiKey: "", workspaceId: "bound" },
        {
          describeApiKey: async () => ({ configured: true, writable: false, source: "env" }),
          resolveApiKey: async () => ({ value: "env-key", source: "env" }),
          readPersonal: async () => ({ workspace_id: "bound" }),
          readWorkspace: () => "bound",
          writeApiKey,
          writeWorkspace,
          verify,
        },
      ),
    ).toEqual(["workspaceId"]);
    expect(verify).toHaveBeenCalledWith({ apiKey: "env-key", workspaceId: "bound" });
    expect(writeApiKey).not.toHaveBeenCalled();
    expect(writeWorkspace).toHaveBeenCalledWith("bound");
  });
  it("does not persist an invalid pair or expose keys in errors", async () => {
    const writeApiKey = vi.fn();
    const writeWorkspace = vi.fn();
    await expect(
      applyConnectionSettings(
        { apiKey: "new-secret", workspaceId: "bound" },
        {
          describeApiKey: async () => ({ configured: true, writable: true }),
          resolveApiKey: async () => ({ value: "old-secret", source: "file" }),
          readPersonal: async () => ({ workspace_id: "bound" }),
          readWorkspace: () => "bound",
          writeApiKey,
          writeWorkspace,
          verify: async () => {
            throw new Error("rejected new-secret old-secret");
          },
        },
      ),
    ).rejects.toThrow("rejected [redacted] [redacted]");
    expect(writeApiKey).not.toHaveBeenCalled();
    expect(writeWorkspace).not.toHaveBeenCalled();
  });
});
