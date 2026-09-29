import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";
import { validRelativePath, validSyncId, syncPathTag } from "./tags.ts";
import type { SyncScope, SyncState } from "./types.ts";
import { readStateSnapshot } from "../state-store.ts";

/** Bind the state and exact-byte revision to the requested cloud target. */
export async function readSyncCheckpoint(
  path: string,
  target: SyncScope & { categoryId?: string },
  syncId: string | undefined,
  localize: (text: LocalizedText) => string,
): Promise<{ state: SyncState | undefined; revision: string | null }> {
  const snapshot = await readStateSnapshot(path, localize);
  return {
    state: parseSyncState(snapshot.value, target, syncId, localize),
    revision: snapshot.revision,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function hash(value: unknown, length: number): boolean {
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/.test(value);
}
function onlyFields(value: Record<string, unknown>, fields: string[]): boolean {
  return Object.keys(value).every((field) => fields.includes(field));
}

/** State is path/ownership evidence, never an extensible credential container. */
export function parseSyncState(
  value: unknown,
  target: SyncScope & { categoryId?: string },
  syncId: string | undefined,
  localize: (text: LocalizedText) => string,
): SyncState | undefined {
  if (value === undefined) return undefined;
  const invalid = () =>
    new BailianError(
      localize({
        "en-US":
          "Invalid or incompatible synchronization checkpoint. Restore the state file before continuing; it cannot be treated as a first run.",
        "zh-CN": "同步记录无效或版本不兼容。请恢复状态文件后再继续，不能将它当作首次运行。",
      }),
      ExitCode.GENERAL,
    );
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !nonempty(value.syncId) ||
    !validSyncId(value.syncId) ||
    !onlyFields(value, ["schemaVersion", "syncId", "target", "entries", "pending"]) ||
    !record(value.target) ||
    !onlyFields(value.target, ["endpointOrigin", "workspaceId", "indexId", "categoryId"]) ||
    !["endpointOrigin", "workspaceId", "indexId", "categoryId"].every((field) =>
      nonempty(value.target && (value.target as Record<string, unknown>)[field]),
    ) ||
    !record(value.entries) ||
    !Array.isArray(value.pending)
  )
    throw invalid();
  for (const [field, expected] of Object.entries(target)) {
    if (expected !== undefined && value.target[field] !== expected)
      throw new BailianError(
        localize({
          "en-US":
            "Synchronization state belongs to a different target. Use a separate state file for each endpoint, workspace, knowledge base and category.",
          "zh-CN":
            "同步记录属于其他目标。请为不同的 API 地址、工作空间、知识库和类目使用独立状态文件。",
        }),
        ExitCode.GENERAL,
      );
  }
  if (syncId !== undefined && syncId !== value.syncId)
    throw new BailianError(
      localize({
        "en-US":
          "The requested sync ID differs from the checkpoint. Use the saved synchronization ID.",
        "zh-CN": "指定的同步 ID 与记录不一致。请使用记录中的同步 ID。",
      }),
      ExitCode.GENERAL,
    );
  const fileIds = new Set<string>();
  const docIds = new Set<string>();
  const pathHashes = new Set<string>();
  for (const [path, entry] of Object.entries(value.entries)) {
    if (
      !validRelativePath(path) ||
      !record(entry) ||
      entry.relativePath !== path ||
      !onlyFields(entry, [
        "relativePath",
        "contentSha256",
        "contentMd5",
        "size",
        "mtimeMs",
        "fileId",
        "docId",
      ]) ||
      (entry.contentSha256 !== null && !hash(entry.contentSha256, 64)) ||
      !hash(entry.contentMd5, 32) ||
      typeof entry.size !== "number" ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      typeof entry.mtimeMs !== "number" ||
      !Number.isFinite(entry.mtimeMs) ||
      !nonempty(entry.fileId) ||
      !nonempty(entry.docId) ||
      fileIds.has(entry.fileId) ||
      docIds.has(entry.docId) ||
      pathHashes.has(syncPathTag(path))
    )
      throw invalid();
    fileIds.add(entry.fileId);
    docIds.add(entry.docId);
    pathHashes.add(syncPathTag(path));
  }
  const pendingPaths = new Set<string>();
  const operationIds = new Set<string>();
  for (const pending of value.pending) {
    if (
      !record(pending) ||
      !nonempty(pending.operationId) ||
      operationIds.has(pending.operationId) ||
      !nonempty(pending.relativePath) ||
      !validRelativePath(pending.relativePath) ||
      pendingPaths.has(pending.relativePath) ||
      !onlyFields(pending, [
        "operationId",
        "relativePath",
        "action",
        "phase",
        "contentSha256",
        "fileId",
        "ingestionId",
        "newDocId",
        "oldDocId",
      ]) ||
      !["add", "replace", "delete"].includes(String(pending.action)) ||
      !["intent", "registered", "submitted", "ready", "deleting"].includes(String(pending.phase))
    )
      throw invalid();
    for (const field of ["fileId", "ingestionId", "newDocId", "oldDocId"]) {
      if (pending[field] !== undefined && !nonempty(pending[field])) throw invalid();
    }
    if (pending.contentSha256 !== undefined && !hash(pending.contentSha256, 64)) throw invalid();
    const prior = value.entries[pending.relativePath];
    if (pending.action === "delete" || pending.action === "replace") {
      if (!record(prior) || pending.oldDocId !== prior.docId) throw invalid();
    } else if (prior !== undefined) throw invalid();
    if (pending.action === "delete") {
      if (
        !["intent", "deleting"].includes(String(pending.phase)) ||
        pending.newDocId !== undefined ||
        pending.fileId !== undefined
      )
        throw invalid();
    } else {
      if (!hash(pending.contentSha256, 64)) throw invalid();
      if (pending.phase !== "intent" && !nonempty(pending.fileId)) throw invalid();
      if (pending.phase === "submitted" && !nonempty(pending.ingestionId)) throw invalid();
      if (
        ["ready", "deleting"].includes(String(pending.phase)) &&
        (!nonempty(pending.newDocId) || pending.newDocId === pending.oldDocId)
      )
        throw invalid();
      if (pending.action === "add" && pending.phase === "deleting") throw invalid();
    }
    pendingPaths.add(pending.relativePath);
    operationIds.add(pending.operationId);
  }
  return value as unknown as SyncState;
}
