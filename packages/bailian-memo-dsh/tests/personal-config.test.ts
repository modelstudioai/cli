import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  beginEnable,
  markActive,
  markPaused,
  migrateLegacyConfig,
  parsePersonalMemoryConfig,
  resumePersonalMemory,
  writePersonalMemoryConfig,
} from "../src/personal-config.ts";

vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => {
    throw new Error("Tests must pass an explicit temporary config path");
  },
}));

describe("personal-config state machine", () => {
  it("accepts active identity without a profile schema and drops obsolete schema state", () => {
    const migrated = parsePersonalMemoryConfig(
      JSON.stringify({
        schema_version: 2,
        status: "active",
        workspace_id: "ws",
        user_id: "user",
        profile_schema_id: "old-schema",
        profile_schema_version: 1,
      }),
    );
    expect(migrated.status).toBe("active");
    expect(migrated).not.toHaveProperty("profile_schema_id");
    expect(migrated).not.toHaveProperty("profile_schema_version");
  });

  it("migrates legacy enabled=true with full identity to active", () => {
    const migrated = migrateLegacyConfig({
      schema_version: 1,
      enabled: true,
      workspace_id: "ws-1",
      user_id: "user-1",
      profile_schema_id: "schema-1",
      consented_at: "2026-01-01T00:00:00Z",
    });
    expect(migrated.status).toBe("active");
    expect(migrated.user_id).toBe("user-1");
  });

  it("migrates legacy enabled=false with identity to paused", () => {
    const migrated = migrateLegacyConfig({
      schema_version: 1,
      enabled: false,
      workspace_id: "ws-1",
      user_id: "user-1",
    });
    expect(migrated.status).toBe("paused");
  });

  it("atomically persists beginEnable → markActive → pause → resume", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bailian-memo-"));
    const path = join(directory, "config.json");
    const started = await beginEnable({ workspaceId: "ws-abc" }, path);
    expect(started.status).toBe("initializing");
    expect(started.user_id).toBeTruthy();
    const active = await markActive(path);
    expect(active.status).toBe("active");
    expect(active).not.toHaveProperty("profile_schema_id");
    const paused = await markPaused("test", path);
    expect(paused.status).toBe("paused");
    const resumed = await resumePersonalMemory(path);
    expect(resumed.status).toBe("active");
    const onDisk = parsePersonalMemoryConfig(await readFile(path, "utf8"));
    expect(onDisk.user_id).toBe(started.user_id);
  });

  it("keeps user_id stable across rewrite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bailian-memo-"));
    const path = join(directory, "config.json");
    const first = await beginEnable({ workspaceId: "ws-1" }, path);
    await writePersonalMemoryConfig({ ...first, last_error: "x" }, path);
    await expect(beginEnable({ workspaceId: "ws-2" }, path)).rejects.toThrow(
      /workspace.*mismatch/i,
    );
    const unchanged = parsePersonalMemoryConfig(await readFile(path, "utf8"));
    expect(unchanged.user_id).toBe(first.user_id);
    expect(unchanged.workspace_id).toBe("ws-1");
  });
});
