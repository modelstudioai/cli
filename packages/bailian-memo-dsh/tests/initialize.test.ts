import { expect, it, vi } from "vite-plus/test";
import { ensureInitialized } from "../src/initialize.js";
import type { MemoryClient } from "../src/memory-client.js";

const state = vi.hoisted(() => ({
  config: { status: "initializing", user_id: "user", workspace_id: "workspace" },
  markActive: vi.fn(async () => ({ status: "active" })),
}));
vi.mock("../src/personal-config.js", () => ({
  readPersonalMemoryConfig: async () => state.config,
  beginEnable: vi.fn(),
  markActive: state.markActive,
  markInitializingError: vi.fn(),
  resumePersonalMemory: vi.fn(),
  personalMemoryConfigPath: vi.fn(),
}));

it("enables memory without looking up or creating a profile schema", async () => {
  const list = vi.fn(async () => ({}));
  const result = await ensureInitialized({ list } as unknown as MemoryClient);
  expect(list).toHaveBeenCalledExactlyOnceWith({ userId: "user", pageSize: 1 });
  expect(state.markActive).toHaveBeenCalledExactlyOnceWith();
  expect(result.status).toBe("active");
});

it("startup preserves a paused identity without making service requests", async () => {
  const { readFile } = await import("node:fs/promises");
  const entry = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  expect(entry).toContain("void ensureInitialized(client).catch");
  state.config.status = "paused";
  const list = vi.fn();
  const result = await ensureInitialized({ list } as unknown as MemoryClient);
  expect(result.status).toBe("paused");
  expect(list).not.toHaveBeenCalled();
});
