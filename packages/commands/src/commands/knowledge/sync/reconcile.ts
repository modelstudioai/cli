import type { SyncState } from "./types.ts";
import type { SyncRemoteInventory } from "./remote.ts";
import type { SyncPlanManaged, SyncPlanConflict } from "./plan.ts";
import { syncPathTag } from "./tags.ts";

/** Call only with a parsed target-bound checkpoint and a complete inventory for
 * that target/scope. Pending paths are handled by recovery, not ordinary planning.
 * Extra owned documents remain orphans; remote MD5 never replaces local SHA-256.
 */
export function reconcileSyncState(state: SyncState, remote: SyncRemoteInventory) {
  const managed: SyncPlanManaged[] = [];
  const conflicts: SyncPlanConflict[] = [];
  const pendingPaths = new Set(state.pending.map((pending) => pending.relativePath));
  const claimed = new Set<string>();
  for (const entry of Object.values(state.entries)) {
    if (pendingPaths.has(entry.relativePath)) continue;
    const matches = remote.linked.filter(
      (document) =>
        document.docId === entry.docId &&
        document.fileId === entry.fileId &&
        document.pathTag === syncPathTag(entry.relativePath) &&
        document.contentMd5 === entry.contentMd5,
    );
    if (matches.length !== 1 || claimed.has(entry.docId)) {
      conflicts.push({
        relativePath: entry.relativePath,
        reason: "state-remote-ownership-mismatch",
      });
      continue;
    }
    claimed.add(entry.docId);
    managed.push({ ...entry, ready: matches[0].ready });
  }
  const pendingDocIds = new Set(
    state.pending.flatMap((pending) =>
      [pending.oldDocId, pending.newDocId].filter((docId): docId is string => docId !== undefined),
    ),
  );
  return {
    managed,
    conflicts,
    pending: state.pending.map((pending) => ({ ...pending })),
    unmanaged: remote.unmanaged.map((document) => ({ ...document })),
    orphans: remote.linked
      .filter((document) => !claimed.has(document.docId) && !pendingDocIds.has(document.docId))
      .map((document) => ({ ...document })),
    unindexed: remote.unindexed.map((file) => ({ ...file })),
  };
}
