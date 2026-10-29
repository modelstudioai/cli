import { expect, test } from "vite-plus/test";
import { restoreSyncEntries } from "../../src/commands/knowledge/sync/restore.ts";
import { planSync } from "../../src/commands/knowledge/sync/plan.ts";
import { parseSyncState } from "../../src/commands/knowledge/sync/state.ts";
import { syncPathTag } from "../../src/commands/knowledge/sync/tags.ts";
import type { SyncState, SyncLocalFile } from "../../src/commands/knowledge/sync/types.ts";
import type { SyncRemoteInventory } from "../../src/commands/knowledge/sync/remote.ts";
function fixture() {
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
  const file: SyncLocalFile = {
    relativePath: "a.md",
    absolutePath: "/private/a.md",
    contentSha256: "a".repeat(64),
    contentMd5: "b".repeat(32),
    size: 1,
    mtimeMs: 1,
  };
  const remote: SyncRemoteInventory = {
    linked: [
      {
        fileId: "file",
        docId: "doc",
        pathTag: syncPathTag(file.relativePath),
        contentMd5: file.contentMd5,
        ready: true,
      },
    ],
    unindexed: [],
    unmanaged: [],
  };
  return { state, file, remote };
}
test("restored identity never claims remote SHA-256 or skips reupload for identical MD5", () => {
  const input = fixture();
  const result = restoreSyncEntries(input.state, [input.file], input.remote);
  expect(result.state.entries["a.md"].contentSha256).toBeNull();
  expect(
    parseSyncState(result.state, input.state.target, input.state.syncId, (text) =>
      typeof text === "string" ? text : text["en-US"],
    ),
  ).toEqual(result.state);
  const plan = planSync({
    local: [input.file],
    managed: Object.values(result.state.entries),
    conflicts: result.conflicts,
    deleteEnabled: true,
  });
  expect(plan.actions[0].action).toBe("replace");
  expect(plan.risk?.reason).toBe("destructive");
  expect(input.state.entries).toEqual({});
  expect(JSON.stringify(result.state)).not.toContain(input.file.absolutePath);
});
test("unknown remote paths remain outside restored state even with delete enabled", () => {
  const input = fixture();
  input.remote.linked.push({
    ...input.remote.linked[0],
    docId: "orphan",
    fileId: "orphan-source",
    pathTag: syncPathTag("lost.md"),
  });
  const result = restoreSyncEntries(input.state, [input.file], input.remote);
  expect(Object.keys(result.state.entries)).toEqual(["a.md"]);
  expect(result.orphans.map((entry) => entry.docId)).toEqual(["orphan"]);
});
test("multiple indexed versions for one path block restoration", () => {
  const input = fixture();
  input.remote.linked.push({
    ...input.remote.linked[0],
    docId: "other",
    fileId: "other-source",
    contentMd5: "c".repeat(32),
  });
  const result = restoreSyncEntries(input.state, [input.file], input.remote);
  expect(result.conflicts).toHaveLength(1);
  expect(result.state.entries).toEqual({});
});
test("unindexed source alone cannot prove that an earlier import was never submitted", () => {
  const input = fixture();
  input.remote.linked = [];
  input.remote.unindexed.push({
    fileId: "file",
    pathTag: syncPathTag("a.md"),
    contentMd5: input.file.contentMd5,
  });
  expect(restoreSyncEntries(input.state, [input.file], input.remote).conflicts).toHaveLength(1);
});
