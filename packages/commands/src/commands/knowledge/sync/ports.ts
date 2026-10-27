import { setTimeout as delay } from "node:timers/promises";
import {
  BailianError,
  ExitCode,
  type Client,
  type LocalizedText,
  type Settings,
} from "bailian-cli-core";
import { uploadKnowledgeFile } from "../operations/upload.ts";
import { importKnowledgeFiles } from "../operations/index.ts";
import { failedImportDocs, importJobStatusUrl, pollImportJob } from "../shared.ts";
import type { SyncExecutionPorts } from "./execute.ts";
import { withSyncFileSnapshot } from "./snapshot.ts";
import { readSyncRemoteInventory } from "./remote.ts";
import { deleteSyncDocument } from "./delete.ts";

export function createSyncExecutionPorts(options: {
  client: Client;
  target: { workspaceId: string; indexId: string; categoryId: string; scopeTag: string };
  settings: Settings;
  pollInterval: number;
  localize: (text: LocalizedText) => string;
  verify: () => Promise<void>;
}): SyncExecutionPorts {
  const { client, target, settings, localize } = options;
  const invalid = () =>
    new BailianError(
      localize({
        "en-US":
          "Import response is missing a required ID or the ready document does not belong to this import job. Reconcile the pending operation before retrying.",
        "zh-CN": "导入响应缺少必要 ID，或已就绪文档不属于本次导入任务。请核对未完成操作后再重试。",
      }),
      ExitCode.GENERAL,
    );
  return {
    verify: options.verify,
    upload: (file, tags, registered) =>
      withSyncFileSnapshot(file, localize, async (snapshot) => {
        const result = await uploadKnowledgeFile({
          client,
          workspaceId: target.workspaceId,
          categoryId: target.categoryId,
          filePath: snapshot.absolutePath,
          sizeBytes: snapshot.size,
          tags,
          timeout: settings.timeout,
          localize,
          checkpoint: async (record) => {
            if (record.fileId) await registered(record.fileId);
          },
        });
        return result.fileId;
      }),
    async import(fileId) {
      const response = await importKnowledgeFiles(
        client,
        target.workspaceId,
        target.indexId,
        [fileId],
        localize,
      );
      const ingestionId = response.data?.ingestionId;
      if (typeof ingestionId !== "string" || !ingestionId.trim()) throw invalid();
      return ingestionId;
    },
    async waitReady(fileId, ingestionId, tags) {
      const job = await pollImportJob(client, settings, {
        statusUrl: importJobStatusUrl(target.workspaceId, target.indexId, ingestionId).toString(),
        intervalSec: options.pollInterval,
      });
      const failure = failedImportDocs(job)[0];
      if (failure)
        throw new BailianError(
          failure.message ??
            failure.code ??
            failure.status ??
            localize({ "en-US": "Document import failed.", "zh-CN": "文档导入失败。" }),
          ExitCode.GENERAL,
        );
      const deadline = Date.now() + settings.timeout * 1000;
      do {
        const inventory = await readSyncRemoteInventory(client, target, localize);
        const matching = inventory.linked.filter(
          (document) =>
            document.fileId === fileId &&
            tags.includes(target.scopeTag) &&
            tags.includes(document.pathTag) &&
            tags.includes(document.contentMd5),
        );
        if (matching.length > 1) throw invalid();
        const document = matching[0];
        if (document?.ready) {
          const rows = job.data?.rows?.filter((row) => row.doc_id === document.docId) ?? [];
          if (rows.length !== 1 || (rows[0].code ?? rows[0].status) !== "FINISH") throw invalid();
          return document.docId;
        }
        if (Date.now() >= deadline) break;
        await delay(Math.min(options.pollInterval * 1000, Math.max(0, deadline - Date.now())));
      } while (Date.now() < deadline);
      throw new BailianError(
        localize({
          "en-US":
            "Timed out waiting for the imported document to become ready. The pending operation is retained.",
          "zh-CN": "等待导入文档就绪超时。未完成操作记录已保留。",
        }),
        ExitCode.TIMEOUT,
      );
    },
    deleteVerified: (old, replacement) =>
      deleteSyncDocument({
        client,
        target,
        old,
        replacement,
        localize,
        timeoutMs: settings.timeout * 1000,
        intervalMs: options.pollInterval * 1000,
      }),
  };
}
