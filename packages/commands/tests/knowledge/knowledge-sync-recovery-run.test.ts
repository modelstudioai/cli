import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import { runSyncRecovery } from "../../src/commands/knowledge/sync/recovery-run.ts";
import type { SyncState, SyncLocalFile } from "../../src/commands/knowledge/sync/types.ts";
import type { SyncRemoteInventory } from "../../src/commands/knowledge/sync/remote.ts";
import { syncPathTag, syncOperationTag } from "../../src/commands/knowledge/sync/tags.ts";
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "sync-recovery-"));
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
    pending: [
      {
        operationId: "op",
        relativePath: "a.md",
        action: "add",
        phase: "submitted",
        contentSha256: file.contentSha256,
        fileId: "file",
        ingestionId: "job",
      },
    ],
  };
  const remote: SyncRemoteInventory = {
    linked: [
      {
        fileId: "file",
        docId: "doc",
        pathTag: syncPathTag("a.md"),
        contentMd5: file.contentMd5,
        ready: true,
      },
    ],
    unindexed: [],
    unmanaged: [],
  };
  const ports = {
    verify: vi.fn(async () => {}),
    upload: vi.fn(),
    import: vi.fn(async () => "job"),
    waitReady: vi.fn(async () => "doc"),
    deleteVerified: vi.fn(async () => {}),
  };
  return {
    stateFile: join(directory, "state.json"),
    stateRevision: null,
    state,
    files: [file],
    ports,
    localize,
    loadRemote: vi.fn(async () => structuredClone(remote)),
    remote,
  };
}
test("observed completed import is checkpointed without another upload or import", async () => {
  const input = await fixture();
  const result = await runSyncRecovery(input);
  expect(result.requiresReplan).toBe(true);
  expect(result.state.pending).toEqual([]);
  expect(result.state.entries["a.md"].docId).toBe("doc");
  expect(input.ports.upload).not.toHaveBeenCalled();
  expect(input.ports.import).not.toHaveBeenCalled();
});
test("unknown outcome leaves pending untouched", async () => {
  const input = await fixture();
  input.remote.linked = [];
  input.state.pending[0].phase = "intent";
  delete input.state.pending[0].fileId;
  delete input.state.pending[0].ingestionId;
  await expect(runSyncRecovery(input)).rejects.toThrow("recovery");
  expect(input.ports.upload).not.toHaveBeenCalled();
  expect(input.ports.import).not.toHaveBeenCalled();
});
test("observed upload from intent can be recorded before one import", async () => {
  const input = await fixture();
  const document = input.remote.linked[0];
  input.remote.linked = [];
  input.remote.unindexed = [
    {
      fileId: "file",
      pathTag: document.pathTag,
      contentMd5: document.contentMd5,
      operationTag: syncOperationTag(input.state.pending[0].operationId),
    },
  ];
  input.state.pending[0].phase = "intent";
  delete input.state.pending[0].fileId;
  delete input.state.pending[0].ingestionId;
  input.ports.import.mockImplementation(async () => {
    const saved = JSON.parse(await readFile(input.stateFile, "utf8"));
    expect(saved.pending[0].phase).toBe("registered");
    return "job";
  });
  input.ports.waitReady.mockImplementation(async () => {
    input.remote.unindexed = [];
    input.remote.linked = [document];
    return "doc";
  });
  const result = await runSyncRecovery(input);
  expect(result.state.pending).toEqual([]);
  expect(input.ports.import).toHaveBeenCalledTimes(1);
});
test("replacement deletion failure retains a recoverable ready new document", async () => {
  const input = await fixture();
  const local = input.files[0];
  input.state.entries["a.md"] = {
    relativePath: "a.md",
    contentSha256: "c".repeat(64),
    contentMd5: "d".repeat(32),
    size: 1,
    mtimeMs: 1,
    fileId: "old-file",
    docId: "old-doc",
  };
  input.state.pending[0].action = "replace";
  input.state.pending[0].oldDocId = "old-doc";
  input.remote.linked.push({
    fileId: "old-file",
    docId: "old-doc",
    pathTag: syncPathTag(local.relativePath),
    contentMd5: "d".repeat(32),
    ready: true,
  });
  const failure = new Error("delete unknown");
  input.ports.deleteVerified.mockRejectedValueOnce(failure);
  await expect(runSyncRecovery(input)).rejects.toBe(failure);
  const saved = JSON.parse(await readFile(input.stateFile, "utf8"));
  expect(saved.pending[0]).toMatchObject({ phase: "deleting", newDocId: "doc" });
  expect(saved.entries["a.md"].docId).toBe("old-doc");
});

test("ready remote document recovers a lost import response without fabricating a job ID", async () => {
  const input = await fixture();
  input.state.pending[0].phase = "registered";
  delete input.state.pending[0].ingestionId;
  const result = await runSyncRecovery(input);
  expect(result.state.pending).toEqual([]);
  expect(result.state.entries["a.md"].docId).toBe("doc");
  expect(input.ports.import).not.toHaveBeenCalled();
});
