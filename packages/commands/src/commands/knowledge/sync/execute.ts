import { randomUUID } from "node:crypto";
import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";
import { withStateLock, assertStateRevision, writeStateFile } from "../state-store.ts";
import { syncTags, syncOperationTag } from "./tags.ts";
import type { planSync } from "./plan.ts";
import type { SyncState, SyncLocalFile, SyncEntry } from "./types.ts";

export interface SyncExecutionPorts {
  /** Rehash all planned inputs and verify remote ownership before any mutation. */
  verify(): Promise<void>;
  upload(
    file: SyncLocalFile,
    tags: string[],
    registered: (fileId: string) => Promise<void>,
  ): Promise<string>;
  import(fileId: string): Promise<string>;
  /** Poll job and uniquely associate the ready document with the uploaded source. */
  waitReady(fileId: string, ingestionId: string, tags: string[]): Promise<string>;
  /** Recheck old ownership and optional ready replacement, then delete and observe absence. */
  deleteVerified(
    this: void,
    old: SyncEntry,
    replacement?: { fileId: string; docId: string; tags: string[] },
  ): Promise<void>;
}

/** Ordinary-plan runner, called only after runtime confirmation. Recovery-only
 * plans use the recovery runner and must be replanned before ordinary execution.
 */
export async function executeSyncPlan(options: {
  stateFile: string;
  stateRevision: string | null;
  state: SyncState;
  files: readonly SyncLocalFile[];
  plan: ReturnType<typeof planSync>;
  ports: SyncExecutionPorts;
  localize: (text: LocalizedText) => string;
}) {
  const { stateFile, ports, localize, plan } = options;
  const invalid = () =>
    new BailianError(
      localize({
        "en-US":
          "The sync plan is incomplete, stale, or requires recovery. Prepare a fresh plan before writing resources.",
        "zh-CN": "同步计划不完整、已过期或需要恢复。请在写入资源前重新生成计划。",
      }),
      ExitCode.GENERAL,
    );
  if (plan.blocked || plan.requiresReplan || options.state.pending.length) throw invalid();
  const files = new Map(options.files.map((file) => [file.relativePath, file]));
  for (const action of plan.actions) {
    if (["conflict", "recover"].includes(action.action)) throw invalid();
    if (["add", "replace"].includes(action.action)) {
      const file = files.get(action.relativePath);
      if (!file || file.contentSha256 !== action.fingerprint?.contentSha256) throw invalid();
    }
    if (["replace", "delete"].includes(action.action)) {
      const entry = options.state.entries[action.relativePath];
      if (!entry || entry.docId !== action.oldDocId || entry.fileId !== action.oldFileId)
        throw invalid();
    }
  }
  return withStateLock(stateFile, localize, async () => {
    await assertStateRevision(stateFile, options.stateRevision, localize);
    await ports.verify();
    const state = structuredClone(options.state);
    const completed: { relativePath: string; action: string }[] = [];
    const checkpoint = () => writeStateFile(stateFile, state);
    for (const action of plan.actions) {
      const relativePath = action.relativePath;
      if (action.action === "skip" || action.action === "retain") {
        completed.push({ relativePath, action: action.action });
        continue;
      }
      if (action.action !== "add" && action.action !== "replace" && action.action !== "delete")
        throw invalid();
      const old = state.entries[relativePath];
      const file = files.get(relativePath);
      const pending = {
        operationId: randomUUID(),
        relativePath,
        action: action.action,
        phase: "intent" as const,
        ...(old ? { oldDocId: old.docId } : {}),
        ...(file && action.action !== "delete" ? { contentSha256: file.contentSha256 } : {}),
      };
      state.pending = [pending];
      await checkpoint();
      const operation = state.pending[0];
      if (action.action === "delete") {
        operation.phase = "deleting";
        await checkpoint();
        await ports.deleteVerified(old);
        delete state.entries[relativePath];
      } else {
        if (!file) throw invalid();
        const tags = [
          ...syncTags(state.target, state.syncId, relativePath, file.contentMd5),
          syncOperationTag(operation.operationId),
        ];
        const fileId = await ports.upload(file, tags, async (registeredId) => {
          if (!registeredId.trim()) throw invalid();
          operation.fileId = registeredId;
          operation.phase = "registered";
          await checkpoint();
        });
        if (!fileId.trim() || operation.fileId !== fileId) throw invalid();
        const ingestionId = await ports.import(fileId);
        if (!ingestionId.trim()) throw invalid();
        operation.ingestionId = ingestionId;
        operation.phase = "submitted";
        await checkpoint();
        const docId = await ports.waitReady(fileId, ingestionId, tags);
        if (!docId.trim() || docId === old?.docId) throw invalid();
        operation.newDocId = docId;
        operation.phase = "ready";
        await checkpoint();
        if (action.action === "replace") {
          operation.phase = "deleting";
          await checkpoint();
          await ports.deleteVerified(old, { fileId, docId, tags });
        }
        state.entries[relativePath] = {
          relativePath,
          contentSha256: file.contentSha256,
          contentMd5: file.contentMd5,
          size: file.size,
          mtimeMs: file.mtimeMs,
          fileId,
          docId,
        };
      }
      state.pending = [];
      await checkpoint();
      completed.push({ relativePath, action: action.action });
    }
    return { state, completed };
  });
}
