import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";
import { withStateLock, assertStateRevision, writeStateFile } from "../state-store.ts";
import type { SyncState, SyncLocalFile } from "./types.ts";
import type { SyncRemoteInventory } from "./remote.ts";
import type { SyncExecutionPorts } from "./execute.ts";
import { inspectSyncRecovery } from "./recover.ts";
import { syncTags, syncOperationTag } from "./tags.ts";

/** Runtime confirms recovery risk before calling. Only pending work is handled;
 * callers must prepare and confirm again before ordinary sync actions.
 */
export async function runSyncRecovery(options: {
  stateFile: string;
  stateRevision: string | null;
  state: SyncState;
  files: readonly SyncLocalFile[];
  ports: SyncExecutionPorts;
  loadRemote: () => Promise<SyncRemoteInventory>;
  localize: (text: LocalizedText) => string;
}) {
  const { ports, localize, stateFile } = options;
  const blocked = () =>
    new BailianError(
      localize({
        "en-US":
          "Sync recovery cannot safely advance this pending operation. Keep the checkpoint and inspect its remote resources; do not repeat the original write.",
        "zh-CN": "同步恢复无法安全推进此未完成操作。请保留记录并核对远端资源，不要重复原写请求。",
      }),
      ExitCode.GENERAL,
    );
  return withStateLock(stateFile, localize, async () => {
    await assertStateRevision(stateFile, options.stateRevision, localize);
    await ports.verify();
    const state = structuredClone(options.state);
    const checkpoint = () => writeStateFile(stateFile, state);
    const completed: string[] = [];
    for (const pending of state.pending) {
      const local = options.files.find((file) => file.relativePath === pending.relativePath);
      const old = state.entries[pending.relativePath];
      const tags = local
        ? [
            ...syncTags(state.target, state.syncId, pending.relativePath, local.contentMd5),
            syncOperationTag(pending.operationId),
          ]
        : [];
      let decision = inspectSyncRecovery({
        pending,
        old,
        local,
        remote: await options.loadRemote(),
      });
      if (decision.action === "record-file") {
        pending.fileId = decision.fileId!;
        pending.phase = "registered";
        await checkpoint();
        // Intent could not have reached import: ordinary execution must persist
        // registered before submitting it. This is a first import, never replay.
        pending.ingestionId = await ports.import(pending.fileId);
        if (!pending.ingestionId?.trim()) throw blocked();
        pending.phase = "submitted";
        await checkpoint();
        decision = { action: "observe", reason: "import-submitted", destructive: false };
      }
      if (decision.action === "observe") {
        if (!pending.fileId || !pending.ingestionId) throw blocked();
        await ports.waitReady(pending.fileId, pending.ingestionId, tags);
        decision = inspectSyncRecovery({ pending, old, local, remote: await options.loadRemote() });
      }
      if (
        decision.action === "blocked" ||
        decision.action === "observe" ||
        decision.action === "record-file"
      )
        throw blocked();
      if (pending.action !== "delete") {
        if (!local || !decision.fileId || !decision.newDocId) throw blocked();
        pending.fileId = decision.fileId;
        pending.newDocId = decision.newDocId;
        pending.phase = "ready";
        await checkpoint();
      }
      if (decision.action === "delete-old") {
        if (!old) throw blocked();
        pending.phase = "deleting";
        await checkpoint();
        await ports.deleteVerified(
          old,
          pending.action === "replace"
            ? { fileId: pending.fileId!, docId: pending.newDocId!, tags }
            : undefined,
        );
      }
      if (pending.action === "delete") delete state.entries[pending.relativePath];
      else {
        if (!local) throw blocked();
        state.entries[pending.relativePath] = {
          relativePath: local.relativePath,
          contentSha256: local.contentSha256,
          contentMd5: local.contentMd5,
          size: local.size,
          mtimeMs: local.mtimeMs,
          fileId: pending.fileId!,
          docId: pending.newDocId!,
        };
      }
      state.pending = state.pending.filter((entry) => entry.operationId !== pending.operationId);
      await checkpoint();
      completed.push(pending.relativePath);
    }
    return { state, completed, requiresReplan: true as const };
  });
}
