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
