import { setTimeout as delay } from "node:timers/promises";
import {
  BailianError,
  ExitCode,
  ragEndpoint,
  RAG_PATHS,
  type Client,
  type LocalizedText,
} from "bailian-cli-core";
import type { SyncEntry } from "./types.ts";
import { readSyncRemoteInventory } from "./remote.ts";
import { syncPathTag } from "./tags.ts";

/** Delete exactly one proven index document. Source files are never deleted.
 * Caller owns the checkpoint lock and has obtained destructive confirmation.
 */
export async function deleteSyncDocument(options: {
  client: Client;
  target: { workspaceId: string; indexId: string; categoryId: string; scopeTag: string };
  old: SyncEntry;
  replacement?: { fileId: string; docId: string; tags: string[] };
  timeoutMs: number;
  intervalMs: number;
  localize: (text: LocalizedText) => string;
}): Promise<void> {
  const { client, target, old, replacement, localize } = options;
  const changed = (kind: "ownership" | "replacement") =>
    new BailianError(
      localize(
        kind === "ownership"
          ? {
              "en-US": "Document ownership changed before deletion. Prepare a fresh sync plan.",
              "zh-CN": "删除前发现文档归属已变化，请重新生成同步计划。",
            }
          : {
              "en-US":
                "The replacement document is missing, changed, or not ready. The old document was not deleted by this check.",
              "zh-CN": "替换文档缺失、已变化或尚未就绪。本次检查未删除旧文档。",
            },
      ),
      ExitCode.GENERAL,
    );
  async function inspect() {
    const inventory = await readSyncRemoteInventory(client, target, localize);
    if (replacement) {
      const newer = inventory.linked.find((document) => document.docId === replacement.docId);
      if (
        !newer ||
        !newer.ready ||
        newer.fileId !== replacement.fileId ||
        newer.docId === old.docId ||
        newer.pathTag !== syncPathTag(old.relativePath) ||
        !replacement.tags.includes(target.scopeTag) ||
        !replacement.tags.includes(newer.pathTag) ||
        !replacement.tags.includes(newer.contentMd5)
      )
        throw changed("replacement");
    }
    if (inventory.unmanaged.some((document) => document.docId === old.docId))
      throw changed("ownership");
    const observed = inventory.linked.find((document) => document.docId === old.docId);
    if (
      observed &&
      (observed.fileId !== old.fileId ||
        observed.pathTag !== syncPathTag(old.relativePath) ||
        observed.contentMd5 !== old.contentMd5)
    )
      throw changed("ownership");
    return observed === undefined;
  }
  if (await inspect()) return;
  await client.requestJson({
    path: ragEndpoint(target.workspaceId, RAG_PATHS.indexDeleteFile),
    method: "POST",
    body: { index_id: target.indexId, doc_ids: [old.docId] },
  });
  const deadline = Date.now() + options.timeoutMs;
  do {
    if (await inspect()) return;
    if (Date.now() >= deadline) break;
    await delay(Math.min(options.intervalMs, Math.max(0, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new BailianError(
    localize({
      "en-US":
        "Timed out waiting for document deletion. The pending checkpoint is retained; inspect remote state before retrying.",
      "zh-CN": "等待文档删除生效超时。未完成记录已保留；请先核对远端状态再重试。",
    }),
    ExitCode.TIMEOUT,
  );
}
