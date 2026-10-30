import type { CommandRisk } from "bailian-cli-core";
import type { SyncFingerprint, SyncPending, SyncSkipped } from "./types.ts";
import { syncPathTag, validRelativePath } from "./tags.ts";

export type SyncPlanLocal = Pick<SyncFingerprint, "relativePath" | "contentSha256"> &
  Partial<Pick<SyncFingerprint, "contentMd5" | "size" | "mtimeMs">>;
export interface SyncPlanManaged extends Omit<SyncPlanLocal, "contentSha256"> {
  contentSha256: string | null;
  fileId: string;
  docId: string;
  /** The remote reader validates ownership and identity before passing these rows. */
  ready?: boolean;
}
export interface SyncPlanConflict {
  relativePath?: string;
  reason: string;
}
export type SyncActionName =
  | "add"
  | "skip"
  | "replace"
  | "retain"
  | "delete"
  | "recover"
  | "conflict";
export interface SyncPlanAction {
  relativePath: string;
  action: SyncActionName;
  reason: string;
  fingerprint?: SyncPlanLocal;
  oldDocId?: string;
  oldFileId?: string;
  operationId?: string;
  pending?: SyncPending;
  destructive?: boolean;
}
export interface SyncPlanInput {
  local: readonly SyncPlanLocal[];
  managed: readonly SyncPlanManaged[];
  unmanaged?: readonly { docId: string }[];
  skipped?: readonly SyncSkipped[];
  pending?: readonly SyncPending[];
  /** Incomplete scans, pagination or association failures must be carried here. */
  conflicts?: readonly SyncPlanConflict[];
  deleteEnabled: boolean;
}

function fingerprint(file: SyncPlanLocal): SyncPlanLocal {
  return {
    relativePath: file.relativePath,
    contentSha256: file.contentSha256,
    ...(file.contentMd5 === undefined ? {} : { contentMd5: file.contentMd5 }),
    ...(file.size === undefined ? {} : { size: file.size }),
    ...(file.mtimeMs === undefined ? {} : { mtimeMs: file.mtimeMs }),
  };
}

/** Pure decisions over validated inventories, never a remote association heuristic.
 * blocked applies to the entire plan, not only the individual conflict rows.
 * Recovery must finish and a fresh plan be confirmed before any ordinary changes.
 */
export function planSync(input: SyncPlanInput) {
  const conflicts: SyncPlanConflict[] = (input.conflicts ?? []).map((conflict) => ({
    ...conflict,
  }));
  const local = new Map<string, SyncPlanLocal>();
  const managed = new Map<string, SyncPlanManaged>();
  const pathTags = new Map<string, string>();
  const docIds = new Set<string>();
  const fileIds = new Set<string>();
  const invalidPaths = new Set<string>();
  const reject = (relativePath: string, reason: string) => {
    invalidPaths.add(relativePath);
    conflicts.push({ relativePath, reason });
  };
  const checkPath = (relativePath: string) => {
    if (!validRelativePath(relativePath)) reject(relativePath, "invalid-relative-path");
    const tag = syncPathTag(relativePath);
    const previous = pathTags.get(tag);
    if (previous !== undefined && previous !== relativePath) {
      reject(previous, "path-tag-collision");
      reject(relativePath, "path-tag-collision");
    }
    pathTags.set(tag, relativePath);
  };
  for (const file of input.local) {
    checkPath(file.relativePath);
    if (local.has(file.relativePath)) reject(file.relativePath, "duplicate-local-path");
    local.set(file.relativePath, file);
  }
  for (const entry of input.managed) {
    checkPath(entry.relativePath);
    if (managed.has(entry.relativePath)) reject(entry.relativePath, "duplicate-managed-path");
    if (!entry.docId || !entry.fileId || docIds.has(entry.docId) || fileIds.has(entry.fileId)) {
      reject(entry.relativePath, "ambiguous-managed-identity");
    }
    docIds.add(entry.docId);
    fileIds.add(entry.fileId);
    managed.set(entry.relativePath, entry);
  }
  const skippedPath = (relativePath: string) =>
    (input.skipped ?? []).some(
      (skipped) =>
        relativePath === skipped.relativePath ||
        (skipped.subtree && relativePath.startsWith(`${skipped.relativePath}/`)),
    );
  const pending = input.pending ?? [];
  const actions: SyncPlanAction[] = [];
  if (pending.length) {
    const pendingPaths = new Set<string>();
    const operationIds = new Set<string>();
    for (const operation of pending) {
      checkPath(operation.relativePath);
      if (pendingPaths.has(operation.relativePath) || operationIds.has(operation.operationId)) {
        reject(operation.relativePath, "duplicate-pending-operation");
      }
      pendingPaths.add(operation.relativePath);
      operationIds.add(operation.operationId);
      if (skippedPath(operation.relativePath))
        reject(operation.relativePath, "pending-path-skipped");
      actions.push({
        relativePath: operation.relativePath,
        action: "recover",
        reason: "unfinished-operation",
        operationId: operation.operationId,
        pending: { ...operation },
        destructive: operation.action !== "add",
        ...(operation.oldDocId ? { oldDocId: operation.oldDocId } : {}),
      });
    }
  } else {
    for (const relativePath of new Set([...local.keys(), ...managed.keys()])) {
      const file = local.get(relativePath);
      const entry = managed.get(relativePath);
      const base = {
        relativePath,
        ...(file ? { fingerprint: fingerprint(file) } : {}),
        ...(entry ? { oldDocId: entry.docId, oldFileId: entry.fileId } : {}),
      };
      if (entry && skippedPath(relativePath)) reject(relativePath, "managed-path-skipped");
      if (entry?.ready === false) reject(relativePath, "managed-document-not-ready");
      if (invalidPaths.has(relativePath)) {
        actions.push({
          ...base,
          action: "conflict",
          reason: conflicts.find((conflict) => conflict.relativePath === relativePath)!.reason,
        });
      } else if (file && !entry) {
        actions.push({ ...base, action: "add", reason: "new-local-path" });
      } else if (file && entry) {
        const unchanged = file.contentSha256 === entry.contentSha256;
        actions.push({
          ...base,
          action: unchanged ? "skip" : "replace",
          reason: unchanged
            ? "same-sha256"
            : entry.contentSha256 === null
              ? "remote-content-unverified"
              : "content-changed",
        });
      } else {
        actions.push({
          ...base,
          action: input.deleteEnabled ? "delete" : "retain",
          reason: input.deleteEnabled ? "local-path-removed" : "remote-deletion-disabled",
        });
      }
    }
  }
  const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
  actions.sort((left, right) => compare(left.relativePath, right.relativePath));
  conflicts.sort(
    (left, right) =>
      compare(left.relativePath ?? "", right.relativePath ?? "") ||
      compare(left.reason, right.reason),
  );
  const counts: Record<SyncActionName, number> = {
    add: 0,
    skip: 0,
    replace: 0,
    retain: 0,
    delete: 0,
    recover: 0,
    conflict: 0,
  };
  for (const action of actions) counts[action.action]++;
  const destructive = actions.some(
    (action) => action.action === "replace" || action.action === "delete" || action.destructive,
  );
  const risk: CommandRisk | null = destructive
    ? {
        level: "high",
        reason: "destructive",
        message: {
          "en-US":
            "This sync plan replaces or deletes managed index documents. Review the target and affected paths before confirming. Source files are retained.",
          "zh-CN":
            "本次同步计划会替换或删除托管索引文档。请查看目标与受影响路径后确认；数据中心源文件会保留。",
        },
      }
    : null;
  return {
    actions,
    counts,
    conflicts,
    blocked: conflicts.length > 0,
    requiresReplan: pending.length > 0,
    unmanaged: (input.unmanaged ?? [])
      .map((entry) => ({ docId: entry.docId }))
      .sort((left, right) => compare(left.docId, right.docId)),
    skipped: (input.skipped ?? [])
      .map((entry) => ({ ...entry }))
      .sort((left, right) => compare(left.relativePath, right.relativePath)),
    risk,
  };
}
