import type { SyncState, SyncLocalFile } from "./types.ts";
import type { SyncRemoteInventory } from "./remote.ts";
import type { SyncPlanConflict } from "./plan.ts";
import { syncPathTag } from "./tags.ts";

/** Only for an absent checkpoint and an explicitly supplied sync ID. Remote tags
 * recover identity, never trustworthy content hashes. Current local metadata is
 * retained for display; null SHA-256 forces a confirmed replacement and reupload.
 */
export function restoreSyncEntries(
  empty: SyncState,
  files: readonly SyncLocalFile[],
  remote: SyncRemoteInventory,
) {
  const state = structuredClone(empty);
  const conflicts: SyncPlanConflict[] = [];
  const claimed = new Set<string>();
  const pathTags = new Set<string>();
  for (const file of files) {
    const pathTag = syncPathTag(file.relativePath);
    if (pathTags.has(pathTag)) {
      conflicts.push({ relativePath: file.relativePath, reason: "path-tag-collision" });
      continue;
    }
    pathTags.add(pathTag);
    const matches = remote.linked.filter((document) => document.pathTag === pathTag);
    if (matches.length > 1 || matches.some((document) => !document.ready)) {
      conflicts.push({
        relativePath: file.relativePath,
        reason: "restore-document-ambiguous-or-not-ready",
      });
      continue;
    }
    const document = matches[0];
    if (!document) {
      if (remote.unindexed.some((source) => source.pathTag === pathTag))
        conflicts.push({
          relativePath: file.relativePath,
          reason: "restore-import-outcome-unknown",
        });
      continue;
    }
    claimed.add(document.docId);
    state.entries[file.relativePath] = {
      relativePath: file.relativePath,
      contentSha256: null,
      contentMd5: document.contentMd5,
      size: file.size,
      mtimeMs: file.mtimeMs,
      fileId: document.fileId,
      docId: document.docId,
    };
  }
  return {
    state,
    conflicts,
    orphans: remote.linked
      .filter((document) => !claimed.has(document.docId))
      .map((document) => ({ ...document })),
  };
}
