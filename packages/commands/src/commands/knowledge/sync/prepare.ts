import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import {
  BailianError,
  ExitCode,
  ragEndpoint,
  RAG_PATHS,
  type Client,
  type LocalizedText,
  type CommandNotice,
} from "bailian-cli-core";
import { listKnowledgeIndexes } from "../operations/list.ts";
import { readSyncCheckpoint } from "./state.ts";
import { resolveSyncCategory } from "./category.ts";
import { scanSyncDirectory } from "./scan.ts";
import { syncScopeTag, validSyncId } from "./tags.ts";
import { readSyncRemoteInventory } from "./remote.ts";
import { reconcileSyncState } from "./reconcile.ts";
import { restoreSyncEntries } from "./restore.ts";
import { planSync } from "./plan.ts";
import type { SyncState } from "./types.ts";

export interface SyncPrepareOptions {
  client: Client;
  workspaceId: string;
  indexId: string;
  directory: string;
  stateFile?: string;
  categoryId?: string;
  syncId?: string;
  deleteEnabled?: boolean;
  localize: (text: LocalizedText) => string;
}
export const syncBillingNotice: CommandNotice = {
  code: "KNOWLEDGE_SYNC_MODEL_BILLING",
  message: {
    "en-US":
      "Importing documents may incur parsing and embedding model charges. This sync does not create a knowledge base; deleting index documents does not stop knowledge base running-time charges.",
    "zh-CN":
      "导入文档可能产生解析与向量化模型费用。本次同步不新建知识库；删除索引文档不会停止知识库按运行时长计费。",
  },
};

/** Fully read-only: no checkpoint, lock, temporary upload or cloud mutation. */
export async function prepareSync(options: SyncPrepareOptions) {
  const { client, localize, workspaceId, indexId } = options;
  if (options.syncId !== undefined && !validSyncId(options.syncId))
    throw new BailianError(
      localize({
        "en-US": "The synchronization ID must be a UUID.",
        "zh-CN": "同步 ID 必须为 UUID。",
      }),
      ExitCode.USAGE,
    );
  const directory = resolve(options.directory);
  const stateFile = resolve(options.stateFile ?? join(directory, ".bailian", "sync-state.json"));
  const scope = {
    endpointOrigin: new URL(ragEndpoint(workspaceId, RAG_PATHS.indexList)).origin,
    workspaceId,
    indexId,
  };
  const checkpoint = await readSyncCheckpoint(
    stateFile,
    {
      ...scope,
      ...(options.categoryId && options.categoryId !== "default"
        ? { categoryId: options.categoryId }
        : {}),
    },
    options.syncId,
    localize,
  );
  const scan = await scanSyncDirectory(directory, stateFile, localize);
  const indexes = await listKnowledgeIndexes(client, workspaceId, localize);
  const index = indexes.find((candidate) => candidate.id === indexId);
  if (!index || (index.knowledgeType != null && index.knowledgeType !== "document"))
    throw new BailianError(
      localize({
        "en-US": "The target knowledge base is missing or is not a document knowledge base.",
        "zh-CN": "目标知识库不存在或不是文档知识库。",
      }),
      ExitCode.GENERAL,
    );
  const categoryId = await resolveSyncCategory(
    client,
    workspaceId,
    checkpoint.state?.target.categoryId ?? options.categoryId,
    localize,
  );
  let state: SyncState = checkpoint.state ?? {
    schemaVersion: 1,
    syncId: options.syncId ?? randomUUID(),
    target: { ...scope, categoryId },
    entries: {},
    pending: [],
  };
  const target = { ...state.target, scopeTag: syncScopeTag(scope, state.syncId) };
  const remote = await readSyncRemoteInventory(client, target, localize);
  const restored =
    !checkpoint.state && options.syncId !== undefined
      ? restoreSyncEntries(state, scan.files, remote)
      : undefined;
  if (restored) state = restored.state;
  const reconciled = reconcileSyncState(state, remote);
  if (restored) reconciled.conflicts.push(...restored.conflicts);
  const plan = planSync({
    ...reconciled,
    local: scan.files,
    skipped: scan.skipped,
    deleteEnabled: options.deleteEnabled ?? false,
  });
  return {
    directory,
    stateFile,
    stateRevision: checkpoint.revision,
    state,
    target,
    scan,
    remote,
    plan,
    orphans: reconciled.orphans,
    notices: [syncBillingNotice],
  };
}
export type SyncPrepared = Awaited<ReturnType<typeof prepareSync>>;
