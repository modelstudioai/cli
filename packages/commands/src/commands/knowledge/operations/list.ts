import {
  BailianError,
  ExitCode,
  ragEndpoint,
  RAG_PATHS,
  type Client,
  type LocalizedText,
  type RagIndexListResponse,
  type RagIndexRow,
  type RagAgentListResponse,
  type RagAgentRow,
  type RagIndexFileDetailsResponse,
  type RagIndexFileDetailRow,
  type RagDataCenterFile,
  type RagListFileResponse,
} from "bailian-cli-core";

type Localize = (text: LocalizedText) => string;

function incompleteInventory(localize: Localize): BailianError {
  return new BailianError(
    localize({
      "en-US":
        "The remote resource listing is incomplete or inconsistent. Retry after concurrent changes have finished; no resource changes were made by this read.",
      "zh-CN": "远端资源清单不完整或不一致。请在其他操作结束后重试；本次读取未修改资源。",
    }),
    ExitCode.GENERAL,
  );
}

/** A partial inventory cannot prove absence or justify deleting a document. */
export async function collectResourcePages<Row>(
  load: (page: number) => Promise<{ rows?: Row[]; total?: number }>,
  identify: (row: Row) => string | undefined,
  localize: Localize,
): Promise<Row[]> {
  const rows: Row[] = [];
  const seen = new Set<string>();
  let expectedTotal: number | undefined;
  const incomplete = () => incompleteInventory(localize);
  for (let page = 1; page <= 10000; page++) {
    const result = await load(page);
    if (!Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || result.total! < 0)
      throw incomplete();
    if (expectedTotal !== undefined && result.total !== expectedTotal) throw incomplete();
    expectedTotal = result.total!;
    for (const row of result.rows) {
      if (!row || typeof row !== "object") throw incomplete();
      const id = identify(row);
      if (typeof id !== "string" || !id.trim() || seen.has(id)) throw incomplete();
      seen.add(id);
      rows.push(row);
    }
    if (rows.length > expectedTotal) throw incomplete();
    if (rows.length === expectedTotal) return rows;
    if (result.rows.length === 0) throw incomplete();
  }
  throw incomplete();
}

/** Cursor listing uses the same listFile contract as the public file-list command.
 * The caller must resolve an actual category ID before calling this function.
 * Returned IDs are file IDs only: this does not establish index document identity.
 */
export async function listKnowledgeFiles(
  client: Client,
  workspaceId: string,
  categoryId: string,
  localize: Localize,
): Promise<RagDataCenterFile[]> {
  const files: RagDataCenterFile[] = [];
  const fileIds = new Set<string>();
  const cursors = new Set<string>();
  let nextToken: string | undefined;
  for (let page = 0; page < 10000; page++) {
    const response = await client.requestJson<RagListFileResponse>({
      path: ragEndpoint(workspaceId, RAG_PATHS.listFile),
      method: "POST",
      body: { categoryId, maxResult: 100, ...(nextToken ? { nextToken } : {}) },
    });
    const rows = response?.data?.fileList;
    const cursor = response?.data?.nextToken;
    if (!Array.isArray(rows) || (cursor != null && typeof cursor !== "string"))
      throw incompleteInventory(localize);
    for (const file of rows) {
      if (
        !file ||
        typeof file.fileId !== "string" ||
        !file.fileId.trim() ||
        fileIds.has(file.fileId)
      )
        throw incompleteInventory(localize);
      fileIds.add(file.fileId);
      files.push(file);
    }
    if (cursor == null || cursor === "") return files;
    if (rows.length === 0 || cursors.has(cursor)) throw incompleteInventory(localize);
    cursors.add(cursor);
    nextToken = cursor;
  }
  throw incompleteInventory(localize);
}

export function listKnowledgeIndexes(
  client: Client,
  workspaceId: string,
  localize: Localize,
): Promise<RagIndexRow[]> {
  return collectResourcePages(
    async (page) => {
      const url = new URL(ragEndpoint(workspaceId, RAG_PATHS.indexList));
      url.searchParams.set("page_number", String(page));
      url.searchParams.set("page_size", "100");
      const response = await client.requestJson<RagIndexListResponse>({
        path: url.toString(),
        method: "GET",
      });
      return { rows: response.data?.rows, total: response.data?.total_count };
    },
    (row) => row.id,
    localize,
  );
}

export function listKnowledgeServices(
  client: Client,
  workspaceId: string,
  localize: Localize,
): Promise<RagAgentRow[]> {
  return collectResourcePages(
    async (page) => {
      const response = await client.requestJson<RagAgentListResponse>({
        path: ragEndpoint(workspaceId, RAG_PATHS.agentList),
        method: "POST",
        body: { agent_scene: "search", page_number: page, page_size: 100 },
      });
      return { rows: response.data?.rows, total: response.data?.total_count };
    },
    (row) => row.agent_id,
    localize,
  );
}

export function listKnowledgeDocuments(
  client: Client,
  workspaceId: string,
  indexId: string,
  localize: Localize,
): Promise<RagIndexFileDetailRow[]> {
  return collectResourcePages(
    async (page) => {
      const response = await client.requestJson<RagIndexFileDetailsResponse>({
        path: ragEndpoint(workspaceId, RAG_PATHS.indexFileDetails),
        method: "POST",
        body: { indexId, pageNumber: page, pageSize: 10 },
      });
      return { rows: response.data?.rows, total: response.data?.total_count };
    },
    (row) => row.doc_id,
    localize,
  );
}
