import { relative, resolve, sep } from "node:path";
import { BailianError, ExitCode, type Client, type LocalizedText } from "bailian-cli-core";
import { scanSyncDirectory } from "./scan.ts";
import { readSyncRemoteInventory, type SyncRemoteInventory } from "./remote.ts";
import type { SyncScan } from "./types.ts";

function scanSignature(scan: SyncScan, stateRelativePath: string): string {
  return JSON.stringify({
    files: scan.files
      .map((file) => ({
        relativePath: file.relativePath,
        contentSha256: file.contentSha256,
        contentMd5: file.contentMd5,
        size: file.size,
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    skipped: scan.skipped
      .filter(
        (entry) =>
          entry.reason !== "excluded" &&
          !(entry.reason === "directory" && stateRelativePath.startsWith(`${entry.relativePath}/`)),
      )
      .map((entry) => ({
        relativePath: entry.relativePath,
        reason: entry.reason,
        subtree: entry.subtree,
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
  });
}
function remoteSignature(remote: SyncRemoteInventory): string {
  return JSON.stringify({
    linked: remote.linked
      .map((entry) => ({
        fileId: entry.fileId,
        docId: entry.docId,
        pathTag: entry.pathTag,
        contentMd5: entry.contentMd5,
        operationTag: entry.operationTag,
        ready: entry.ready,
      }))
      .sort((left, right) => left.docId.localeCompare(right.docId)),
    unindexed: remote.unindexed
      .map((entry) => ({
        fileId: entry.fileId,
        pathTag: entry.pathTag,
        contentMd5: entry.contentMd5,
        operationTag: entry.operationTag,
      }))
      .sort((left, right) => left.fileId.localeCompare(right.fileId)),
    unmanaged: remote.unmanaged
      .map((entry) => ({ docId: entry.docId }))
      .sort((left, right) => left.docId.localeCompare(right.docId)),
  });
}

/** Invoked under the checkpoint lock, before cloud writes. Metadata-only mtime
 * changes do not change the plan; full contents, skipped paths and remote identities do.
 */
export async function verifySyncInputs(options: {
  client: Client;
  directory: string;
  stateFile: string;
  scan: SyncScan;
  remote: SyncRemoteInventory;
  target: { workspaceId: string; indexId: string; categoryId: string; scopeTag: string };
  localize: (text: LocalizedText) => string;
}): Promise<void> {
  const changed = () =>
    new BailianError(
      options.localize({
        "en-US":
          "Sync inputs changed after planning. No changes were applied by this verification; preview and confirm a fresh plan.",
        "zh-CN": "同步输入在生成计划后发生变化。本次复核未执行修改；请重新预览并确认最新计划。",
      }),
      ExitCode.GENERAL,
    );
  const scan = await scanSyncDirectory(options.directory, options.stateFile, options.localize);
  const stateRelativePath = relative(resolve(options.directory), resolve(options.stateFile))
    .split(sep)
    .join("/");
  if (scanSignature(scan, stateRelativePath) !== scanSignature(options.scan, stateRelativePath))
    throw changed();
  const remote = await readSyncRemoteInventory(options.client, options.target, options.localize);
  if (remoteSignature(remote) !== remoteSignature(options.remote)) throw changed();
}
