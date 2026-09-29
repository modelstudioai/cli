import type { SyncPending, SyncEntry, SyncFingerprint } from "./types.ts";
import type { SyncRemoteInventory } from "./remote.ts";
import { syncPathTag, syncOperationTag } from "./tags.ts";

export interface SyncRecoveryDecision {
  action: "blocked" | "observe" | "record-file" | "commit-new" | "delete-old" | "commit-delete";
  reason: string;
  destructive: boolean;
  fileId?: string;
  newDocId?: string;
  oldDocId?: string;
  ingestionId?: string;
}

/** Read-only recovery decisions. They never authorize replaying an uncertain write.
 * Caller must re-read inventories under the checkpoint lock before applying a decision.
 */
export function inspectSyncRecovery(input: {
  pending: SyncPending;
  old?: SyncEntry;
  local?: SyncFingerprint;
  remote: SyncRemoteInventory;
}): SyncRecoveryDecision {
  const { pending, old, local, remote } = input;
  const blocked = (reason: string): SyncRecoveryDecision => ({
    action: "blocked",
    reason,
    destructive: false,
  });
  let oldPresent = false;
  if (pending.action !== "add") {
    if (!old || old.docId !== pending.oldDocId || old.relativePath !== pending.relativePath)
      return blocked("old-checkpoint-mismatch");
    if (remote.unmanaged.some((document) => document.docId === old.docId))
      return blocked("old-ownership-changed");
    const matches = remote.linked.filter((document) => document.docId === old.docId);
    if (matches.length > 1) return blocked("old-identity-ambiguous");
    const observed = matches[0];
    if (
      observed &&
      (observed.fileId !== old.fileId ||
        observed.pathTag !== syncPathTag(old.relativePath) ||
        observed.contentMd5 !== old.contentMd5)
    )
      return blocked("old-ownership-changed");
    oldPresent = observed !== undefined;
  }
  if (pending.action === "delete")
    return {
      action: oldPresent ? "delete-old" : "commit-delete",
      destructive: oldPresent,
      reason: oldPresent ? "old-document-still-present" : "old-document-absent",
      oldDocId: pending.oldDocId,
    };
  if (
    !local ||
    local.relativePath !== pending.relativePath ||
    local.contentSha256 !== pending.contentSha256
  )
    return blocked("pending-content-unavailable-or-changed");
  const pathTag = syncPathTag(pending.relativePath);
  const matchesOperation = (entry: { fileId: string; operationTag?: string }) =>
    pending.fileId
      ? entry.fileId === pending.fileId
      : entry.operationTag === syncOperationTag(pending.operationId);
  const documents = remote.linked.filter(
    (document) =>
      document.pathTag === pathTag &&
      document.contentMd5 === local.contentMd5 &&
      matchesOperation(document),
  );
  const sources = remote.unindexed.filter(
    (file) =>
      file.pathTag === pathTag && file.contentMd5 === local.contentMd5 && matchesOperation(file),
  );
  if (documents.length + sources.length !== 1) return blocked("new-version-missing-or-ambiguous");
  const observed = documents[0] ?? sources[0];
  if (pending.fileId && pending.fileId !== observed.fileId)
    return blocked("new-file-identity-changed");
  const document = documents[0];
  if (!document) {
    if (pending.phase === "intent" && !pending.ingestionId && !pending.newDocId)
      return {
        action: "record-file",
        reason: "upload-observed",
        destructive: false,
        fileId: observed.fileId,
      };
    if (pending.ingestionId)
      return {
        action: "observe",
        reason: "await-existing-import",
        destructive: false,
        ingestionId: pending.ingestionId,
        fileId: observed.fileId,
      };
    return blocked("import-outcome-unknown");
  }
  if (
    document.docId === pending.oldDocId ||
    (pending.newDocId && document.docId !== pending.newDocId)
  )
    return blocked("new-document-identity-changed");
  if (!document.ready)
    return {
      action: "observe",
      reason: "new-version-not-ready",
      destructive: false,
      fileId: document.fileId,
      newDocId: document.docId,
      ingestionId: pending.ingestionId,
    };
  return {
    action: pending.action === "replace" && oldPresent ? "delete-old" : "commit-new",
    destructive: pending.action === "replace" && oldPresent,
    reason: "new-version-ready",
    fileId: document.fileId,
    newDocId: document.docId,
    oldDocId: pending.oldDocId,
  };
}
