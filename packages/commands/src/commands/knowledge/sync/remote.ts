import {
  BailianError,
  ExitCode,
  type Client,
  type LocalizedText,
  type RagDataCenterFile,
  type RagIndexFileDetailRow,
} from "bailian-cli-core";
import { listKnowledgeDocuments, listKnowledgeFiles } from "../operations/list.ts";

type Localize = (text: LocalizedText) => string;
interface Identity {
  pathTag: string;
  contentMd5: string;
  operationTag?: string;
}
export interface SyncRemoteFile extends Identity {
  fileId: string;
}
export interface SyncRemoteDocument extends SyncRemoteFile {
  docId: string;
  ready: boolean;
}
export interface SyncRemoteInventory {
  linked: SyncRemoteDocument[];
  unindexed: SyncRemoteFile[];
  unmanaged: { docId: string }[];
}

/** Based on verified sync-remote-contract.json: complete tags, never names or ID suffixes. */
export function associateSyncInventory(
  input: {
    scopeTag: string;
    files: readonly RagDataCenterFile[];
    documents: readonly RagIndexFileDetailRow[];
  },
  localize: Localize,
): SyncRemoteInventory {
  const invalid = () =>
    new BailianError(
      localize({
        "en-US":
          "Remote sync ownership is incomplete or ambiguous. No document changes were made; inspect the file and document tags before retrying.",
        "zh-CN": "远端同步归属不完整或存在歧义。未修改文档；请核对源文件与索引文档标签后重试。",
      }),
      ExitCode.GENERAL,
    );
  if (!/^s[0-9a-f]{31}$/.test(input.scopeTag)) throw invalid();
  function identity(tags: unknown): Identity | undefined {
    if (tags === undefined) return undefined;
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) throw invalid();
    if (!tags.includes(input.scopeTag)) return undefined;
    const scopes = tags.filter((tag: string) => /^s[0-9a-f]{31}$/.test(tag));
    const paths = tags.filter((tag: string) => /^p[0-9a-f]{31}$/.test(tag));
    const hashes = tags.filter((tag: string) => /^[0-9a-f]{32}$/.test(tag));
    const operations = tags.filter((tag: string) => /^v[0-9a-f]{31}$/.test(tag));
    if (scopes.length !== 1 || paths.length !== 1 || hashes.length !== 1 || operations.length > 1)
      throw invalid();
    return {
      pathTag: paths[0],
      contentMd5: hashes[0],
      ...(operations[0] ? { operationTag: operations[0] } : {}),
    };
  }
  const key = (entry: Identity) =>
    `${entry.pathTag}:${entry.contentMd5}:${entry.operationTag ?? ""}`;
  const files = new Map<string, SyncRemoteFile>();
  const fileIds = new Set<string>();
  for (const file of input.files) {
    if (!file || typeof file.fileId !== "string" || !file.fileId.trim() || fileIds.has(file.fileId))
      throw invalid();
    fileIds.add(file.fileId);
    const owner = identity(file.tags);
    if (!owner) continue;
    if (files.has(key(owner))) throw invalid();
    files.set(key(owner), { ...owner, fileId: file.fileId });
  }
  const result: SyncRemoteInventory = { linked: [], unindexed: [], unmanaged: [] };
  const documentIds = new Set<string>();
  const linkedKeys = new Set<string>();
  for (const document of input.documents) {
    if (
      !document ||
      typeof document.doc_id !== "string" ||
      !document.doc_id.trim() ||
      documentIds.has(document.doc_id)
    )
      throw invalid();
    documentIds.add(document.doc_id);
    const owner = identity(document.tags);
    if (!owner) {
      result.unmanaged.push({ docId: document.doc_id });
      continue;
    }
    const identityKey = key(owner);
    const file = files.get(identityKey);
    if (!file || linkedKeys.has(identityKey)) throw invalid();
    linkedKeys.add(identityKey);
    result.linked.push({ ...file, docId: document.doc_id, ready: document.status === "FINISH" });
  }
  result.unindexed = [...files.entries()]
    .filter(([identityKey]) => !linkedKeys.has(identityKey))
    .map(([, file]) => ({ ...file }));
  result.linked.sort((left, right) => left.docId.localeCompare(right.docId));
  result.unindexed.sort((left, right) => left.fileId.localeCompare(right.fileId));
  result.unmanaged.sort((left, right) => left.docId.localeCompare(right.docId));
  return result;
}

/** Both lists must complete successfully; partial results never reach association. */
export async function readSyncRemoteInventory(
  client: Client,
  target: {
    workspaceId: string;
    indexId: string;
    categoryId: string;
    scopeTag: string;
  },
  localize: Localize,
): Promise<SyncRemoteInventory> {
  const files = await listKnowledgeFiles(client, target.workspaceId, target.categoryId, localize);
  const documents = await listKnowledgeDocuments(
    client,
    target.workspaceId,
    target.indexId,
    localize,
  );
  return associateSyncInventory({ files, documents, scopeTag: target.scopeTag }, localize);
}
