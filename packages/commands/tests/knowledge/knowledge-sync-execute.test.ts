import * as stateStore from "../../src/commands/knowledge/state-store.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import {
  executeSyncPlan,
  type SyncExecutionPorts,
} from "../../src/commands/knowledge/sync/execute.ts";
import { planSync } from "../../src/commands/knowledge/sync/plan.ts";
import type { SyncState, SyncLocalFile } from "../../src/commands/knowledge/sync/types.ts";
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "sync-execute-"));
  directories.push(directory);
  const file: SyncLocalFile = {
    relativePath: "a.md",
    absolutePath: join(directory, "a.md"),
    contentSha256: "a".repeat(64),
    contentMd5: "b".repeat(32),
    size: 1,
    mtimeMs: 1,
  };
  const state: SyncState = {
    schemaVersion: 1,
    syncId: "3c4e5635-7b2e-4a1d-813b-c848586e0ea9",
    target: {
      endpointOrigin: "https://example.com",
      workspaceId: "ws",
      indexId: "index",
      categoryId: "category",
    },
    entries: {},
    pending: [],
  };
  const events: string[] = [];
  const stateFile = join(directory, "state.json");
  const saved = async () => JSON.parse(await readFile(stateFile, "utf8")) as SyncState;
  const ports: SyncExecutionPorts = {
    verify: vi.fn(async () => {
      events.push("verify");
    }),
    upload: vi.fn(async (_file, _tags, registered) => {
      expect((await saved()).pending[0].phase).toBe("intent");
      events.push("upload");
      await registered("new-file");
      return "new-file";
    }),
    import: vi.fn(async () => {
      expect((await saved()).pending[0].phase).toBe("registered");
      events.push("import");
      return "job";
    }),
    waitReady: vi.fn(async () => {
      expect((await saved()).pending[0].phase).toBe("submitted");
      events.push("new-ready");
      return "new-doc";
    }),
    deleteVerified: vi.fn(async () => {
      expect((await saved()).pending[0].phase).toBe("deleting");
      events.push("delete-old");
    }),
  };
  return { state, file, ports, events, stateFile, saved, localize, stateRevision: null };
}
test("add checkpoints each stage and completes without deleting", async () => {
  const input = await fixture();
  const plan = planSync({ local: [input.file], managed: [], deleteEnabled: false });
  await executeSyncPlan({ ...input, files: [input.file], plan });
  expect(input.events).toEqual(["verify", "upload", "import", "new-ready"]);
  expect((await input.saved()).pending).toEqual([]);
  expect((await input.saved()).entries["a.md"].docId).toBe("new-doc");
  expect(JSON.stringify(await input.saved())).not.toContain(input.file.absolutePath);
});
test("replacement waits for ready checkpoint before verified deletion", async () => {
  const input = await fixture();
  const old = {
    ...input.file,
    contentSha256: "c".repeat(64),
    fileId: "old-file",
    docId: "old-doc",
  };
  delete (old as Partial<SyncLocalFile>).absolutePath;
  input.state.entries["a.md"] = old;
  const plan = planSync({ local: [input.file], managed: [old], deleteEnabled: false });
  await executeSyncPlan({ ...input, files: [input.file], plan });
  expect(input.events).toEqual(["verify", "upload", "import", "new-ready", "delete-old"]);
});
test.each(["upload", "import", "waitReady"] as const)(
  "%s failure preserves pending and stops deletion",
  async (operation) => {
    const input = await fixture();
    const failure = new Error("original error");
    vi.mocked(input.ports[operation]).mockRejectedValueOnce(failure);
    const plan = planSync({ local: [input.file], managed: [], deleteEnabled: false });
    await expect(executeSyncPlan({ ...input, files: [input.file], plan })).rejects.toBe(failure);
    expect((await input.saved()).pending).toHaveLength(1);
    expect(input.ports.deleteVerified).not.toHaveBeenCalled();
  },
);
test("stale revision stops before all remote operations", async () => {
  const input = await fixture();
  const plan = planSync({ local: [input.file], managed: [], deleteEnabled: false });
  await expect(
    executeSyncPlan({ ...input, stateRevision: "stale", files: [input.file], plan }),
  ).rejects.toThrow("checkpoint changed");
  expect(input.events).toEqual([]);
});

test("checkpoint failure during registration prevents import", async () => {
  const input = await fixture();
  const failure = new Error("disk full");
  const original = stateStore.writeStateFile;
  let writes = 0;
  vi.spyOn(stateStore, "writeStateFile").mockImplementation(async (...args) => {
    writes++;
    if (writes === 2) throw failure;
    return original(...args);
  });
  const plan = planSync({ local: [input.file], managed: [], deleteEnabled: false });
  await expect(executeSyncPlan({ ...input, files: [input.file], plan })).rejects.toBe(failure);
  expect(input.events).toEqual(["verify", "upload"]);
  expect((await input.saved()).pending[0].phase).toBe("intent");
});

test("delete failure retains old entry and a deleting checkpoint", async () => {
  const input = await fixture();
  const old = {
    relativePath: "a.md",
    contentSha256: "c".repeat(64),
    contentMd5: "d".repeat(32),
    size: 1,
    mtimeMs: 1,
    fileId: "old-file",
    docId: "old-doc",
  };
  input.state.entries["a.md"] = old;
  const failure = new Error("delete outcome unknown");
  vi.mocked(input.ports.deleteVerified).mockRejectedValueOnce(failure);
  const plan = planSync({ local: [], managed: [old], deleteEnabled: true });
  await expect(executeSyncPlan({ ...input, files: [], plan })).rejects.toBe(failure);
  expect((await input.saved()).entries["a.md"]).toEqual(old);
  expect((await input.saved()).pending[0].phase).toBe("deleting");
});

test("second unchanged plan performs no upload, import or deletion", async () => {
  const input = await fixture();
  const plan = planSync({ local: [input.file], managed: [], deleteEnabled: false });
  const first = await executeSyncPlan({ ...input, files: [input.file], plan });
  input.events.splice(0);
  const { revision } = await stateStore.readStateSnapshot(input.stateFile, localize);
  const unchanged = planSync({
    local: [input.file],
    managed: Object.values(first.state.entries),
    deleteEnabled: false,
  });
  await executeSyncPlan({
    ...input,
    state: first.state,
    stateRevision: revision,
    files: [input.file],
    plan: unchanged,
  });
  expect(input.events).toEqual(["verify"]);
});
