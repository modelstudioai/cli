import { expect, test } from "vite-plus/test";
import { inspectSyncRecovery } from "../../src/commands/knowledge/sync/recover.ts";
import { syncPathTag, syncOperationTag } from "../../src/commands/knowledge/sync/tags.ts";
import type {
  SyncPending,
  SyncFingerprint,
  SyncEntry,
} from "../../src/commands/knowledge/sync/types.ts";
import type { SyncRemoteInventory } from "../../src/commands/knowledge/sync/remote.ts";

function fixture() {
  const local: SyncFingerprint = {
    relativePath: "a.md",
    contentSha256: "a".repeat(64),
    contentMd5: "b".repeat(32),
    size: 1,
    mtimeMs: 1,
  };
  const old: SyncEntry = {
    ...local,
    contentSha256: "c".repeat(64),
    contentMd5: "d".repeat(32),
    fileId: "old-file",
    docId: "old-doc",
  };
  const pending: SyncPending = {
    relativePath: "a.md",
    operationId: "operation",
    action: "replace",
    phase: "ready",
    contentSha256: local.contentSha256,
    oldDocId: old.docId,
    fileId: "new-file",
    newDocId: "new-doc",
    ingestionId: "job",
  };
  const remote: SyncRemoteInventory = {
    linked: [
      {
        fileId: old.fileId,
        docId: old.docId,
        contentMd5: old.contentMd5,
        pathTag: syncPathTag("a.md"),
        ready: true,
      },
      {
        fileId: "new-file",
        docId: "new-doc",
        contentMd5: local.contentMd5,
        pathTag: syncPathTag("a.md"),
        ready: true,
      },
    ],
    unindexed: [],
    unmanaged: [],
  };
  return { local, old, pending, remote };
}

test("ready replacement still requires destructive confirmation", () => {
  expect(inspectSyncRecovery(fixture())).toMatchObject({
    action: "delete-old",
    destructive: true,
    oldDocId: "old-doc",
    newDocId: "new-doc",
  });
});
test("old document disappearance finalizes replacement only when the new version remains ready", () => {
  const input = fixture();
  input.remote.linked.shift();
  expect(inspectSyncRecovery(input).action).toBe("commit-new");
  input.remote.linked[0].ready = false;
  expect(inspectSyncRecovery(input).action).toBe("observe");
});
test.each(["content", "new-id", "old-tags", "unmanaged-old", "duplicate"])(
  "blocks unsafe recovery %s",
  (problem) => {
    const input = fixture();
    if (problem === "content") input.local.contentSha256 = "e".repeat(64);
    if (problem === "new-id") input.pending.newDocId = "wrong";
    if (problem === "old-tags") input.remote.linked[0].pathTag = syncPathTag("other.md");
    if (problem === "unmanaged-old") {
      input.remote.linked.shift();
      input.remote.unmanaged.push({ docId: "old-doc" });
    }
    if (problem === "duplicate")
      input.remote.linked.push({ ...input.remote.linked[1], docId: "other" });
    expect(inspectSyncRecovery(input).action).toBe("blocked");
  },
);
test("unknown upload never authorizes retry; observed upload only records its ID", () => {
  const input = fixture();
  input.pending = {
    operationId: "op",
    relativePath: "a.md",
    action: "add",
    phase: "intent",
    contentSha256: input.local.contentSha256,
  };
  input.remote.linked = [];
  expect(inspectSyncRecovery(input).action).toBe("blocked");
  input.remote.unindexed.push({
    fileId: "observed",
    operationTag: syncOperationTag(input.pending.operationId),
    pathTag: syncPathTag("a.md"),
    contentMd5: input.local.contentMd5,
  });
  expect(inspectSyncRecovery(input)).toMatchObject({ action: "record-file", fileId: "observed" });
});
test("registered source without document cannot prove that import was never submitted", () => {
  const input = fixture();
  input.pending.phase = "registered";
  delete input.pending.newDocId;
  delete input.pending.ingestionId;
  input.remote.linked.pop();
  input.remote.unindexed.push({
    fileId: "new-file",
    pathTag: syncPathTag("a.md"),
    contentMd5: input.local.contentMd5,
  });
  expect(inspectSyncRecovery(input).action).toBe("blocked");
});
test("delete recovery distinguishes verified presence from disappearance", () => {
  const input = fixture();
  input.pending = {
    operationId: "op",
    relativePath: "a.md",
    action: "delete",
    phase: "deleting",
    oldDocId: "old-doc",
  };
  expect(inspectSyncRecovery(input)).toMatchObject({ action: "delete-old", destructive: true });
  input.remote.linked.shift();
  expect(inspectSyncRecovery(input)).toMatchObject({ action: "commit-delete", destructive: false });
});

test("saved file ID distinguishes another upload of identical content", () => {
  const input = fixture();
  input.remote.linked.push({
    ...input.remote.linked[1],
    fileId: "another-file",
    docId: "another-doc",
    operationTag: `v${"f".repeat(31)}`,
  });
  expect(inspectSyncRecovery(input)).toMatchObject({ action: "delete-old", newDocId: "new-doc" });
});

test.each([undefined, `v${"f".repeat(31)}`])(
  "unknown upload intent never adopts a historical source with operation tag %s",
  (operationTag) => {
    const input = fixture();
    input.pending = {
      operationId: "current-operation",
      relativePath: input.local.relativePath,
      action: "replace",
      phase: "intent",
      oldDocId: input.old.docId,
      contentSha256: input.local.contentSha256,
    };
    input.remote.linked.pop();
    input.remote.unindexed.push({
      fileId: "historical-file",
      pathTag: syncPathTag(input.local.relativePath),
      contentMd5: input.local.contentMd5,
      ...(operationTag ? { operationTag } : {}),
    });
    expect(inspectSyncRecovery(input).action).toBe("blocked");
  },
);
