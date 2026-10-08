import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  beginEnable,
  markActive,
  markPaused,
  migrateLegacyConfig,
  parsePersonalMemoryConfig,
  profileSchemaNameForUser,
  resumePersonalMemory,
  writePersonalMemoryConfig,
} from "../src/personal-config.ts";

describe("personal-config state machine", () => {
  it("derives profile schema name from user id", () => {
    expect(profileSchemaNameForUser("01234567-89ab-cdef-0123-456789abcdef")).toBe(
      "pm_0123456789abcdef01234567",
    );
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
    const active = await markActive("schema-xyz", path);
    expect(active.status).toBe("active");
    expect(active.profile_schema_id).toBe("schema-xyz");
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
    const second = await beginEnable({ workspaceId: "ws-2" }, path);
    expect(second.user_id).toBe(first.user_id);
    expect(second.workspace_id).toBe("ws-2");
  });
});
