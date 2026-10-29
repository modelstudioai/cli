export interface SyncScope {
  endpointOrigin: string;
  workspaceId: string;
  indexId: string;
}

export interface SyncFingerprint {
  relativePath: string;
  contentSha256: string;
  contentMd5: string;
  size: number;
  mtimeMs: number;
}

export interface SyncLocalFile extends SyncFingerprint {
  absolutePath: string;
}

export interface SyncEntry extends Omit<SyncFingerprint, "contentSha256"> {
  /** null when restoring identity without trustworthy remote content evidence. */
  contentSha256: string | null;
  fileId: string;
  docId: string;
}

export interface SyncPending {
  operationId: string;
  relativePath: string;
  action: "add" | "replace" | "delete";
  phase: "intent" | "registered" | "submitted" | "ready" | "deleting";
  contentSha256?: string;
  fileId?: string;
  ingestionId?: string;
  newDocId?: string;
  oldDocId?: string;
}

export interface SyncState {
  schemaVersion: 1;
  syncId: string;
  target: SyncScope & { categoryId: string };
  entries: Record<string, SyncEntry>;
  pending: SyncPending[];
}

export interface SyncSkipped {
  relativePath: string;
  reason: "excluded" | "unsupported" | "symlink" | "not-file" | "directory";
  subtree: boolean;
}

export interface SyncScan {
  files: SyncLocalFile[];
  skipped: SyncSkipped[];
  warnings: string[];
}
