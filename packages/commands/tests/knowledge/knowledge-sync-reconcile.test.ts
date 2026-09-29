import { expect, test } from "vite-plus/test";
import { reconcileSyncState } from "../../src/commands/knowledge/sync/reconcile.ts";
import { planSync } from "../../src/commands/knowledge/sync/plan.ts";
import { syncPathTag } from "../../src/commands/knowledge/sync/tags.ts";
import type { SyncState } from "../../src/commands/knowledge/sync/types.ts";
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
    entries: {
      "a.md": {
        relativePath: "a.md",
        contentSha256: "a".repeat(64),
        contentMd5: "b".repeat(32),
        size: 1,
        mtimeMs: 1,
        fileId: "file",
        docId: "doc",
      },
    },
    pending: [],
  };
  const remote: SyncRemoteInventory = {
    linked: [
      {
        fileId: "file",
        docId: "doc",
        pathTag: syncPathTag("a.md"),
        contentMd5: "b".repeat(32),
        ready: true,
      },
    ],
    unindexed: [],
    unmanaged: [{ docId: "manual" }],
  };
  return { state, remote };
}

test("only exact state ownership enters the deletion plan", () => {
  const { state, remote } = fixture();
  const verified = reconcileSyncState(state, remote);
  const plan = planSync({ ...verified, local: [], deleteEnabled: true });
  expect(plan.blocked).toBe(false);
  expect(plan.actions).toHaveLength(1);
  expect(plan.actions[0]).toMatchObject({ action: "delete", oldDocId: "doc" });
  expect(verified.unmanaged).toEqual([{ docId: "manual" }]);
});

test.each(["fileId", "docId", "pathTag", "contentMd5"] as const)(
  "changed %s blocks the whole plan",
  (field) => {
    const { state, remote } = fixture();
    remote.linked[0][field] = "changed";
    const verified = reconcileSyncState(state, remote);
    expect(verified.conflicts).toHaveLength(1);
    expect(planSync({ ...verified, local: [], deleteEnabled: true }).blocked).toBe(true);
  },
);

test("missing remote document cannot silently remove the saved entry", () => {
  const { state, remote } = fixture();
  remote.linked = [];
  expect(reconcileSyncState(state, remote).conflicts).toHaveLength(1);
});

test("unknown owned documents remain orphans, never deletion candidates", () => {
  const { state, remote } = fixture();
  remote.linked.push({
    ...remote.linked[0],
    fileId: "orphan-file",
    docId: "orphan-doc",
    pathTag: syncPathTag("lost.md"),
  });
  const verified = reconcileSyncState(state, remote);
  expect(verified.orphans).toHaveLength(1);
  expect(verified.managed).toHaveLength(1);
  expect(
    JSON.stringify(planSync({ ...verified, local: [], deleteEnabled: true }).actions),
  ).not.toContain("orphan-doc");
});

test("pending deletion can observe an absent old document and remains recovery-only", () => {
  const { state, remote } = fixture();
  state.pending.push({
    operationId: "op",
    relativePath: "a.md",
    action: "delete",
    phase: "deleting",
    oldDocId: "doc",
  });
  remote.linked = [];
  const verified = reconcileSyncState(state, remote);
  expect(verified.conflicts).toEqual([]);
  expect(planSync({ ...verified, local: [], deleteEnabled: true }).actions[0].action).toBe(
    "recover",
  );
});

test("reconciliation does not modify checkpoint or inventory", () => {
  const input = fixture();
  const before = structuredClone(input);
  const output = reconcileSyncState(input.state, input.remote);
  output.managed[0].docId = "mutated";
  expect(input).toEqual(before);
});
