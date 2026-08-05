// Types for the RAG admin plane (indices / agent / connector domains). Modeled
// after the raw API field names — the mix of snake_case and camelCase reflects
// the server as-is and is intentionally NOT normalized here; normalization only
// happens at the CLI output layer. Kept separate from api.ts to avoid bloating it.

/** Common response envelope for the indices domain (top-level fields are snake_case) */
export interface RagResponse<T> {
  code?: string;
  message?: string;
  status_code?: number;
  request_id?: string;
  data: T;
  [key: string]: unknown;
}

/** GET index/list row (fields inside rows are camelCase as-is; full config field set) */
export interface RagIndexRow {
  id: string;
  name: string;
  description?: string;
  dataType?: string;
  embeddingModelName?: string;
  embeddingDimension?: number;
  chunkSize?: number;
  overlapSize?: number;
  chunkMode?: string;
  separator?: string;
  rerankModelName?: string;
  rerankMinScore?: number;
  rerankTopN?: number;
  rerankMode?: string;
  enableRewrite?: boolean;
  denseSimilarityTopK?: number;
  sparseSimilarityTopK?: number;
  sourceType?: string;
  connectorId?: string;
  [key: string]: unknown;
}

export interface RagIndexListData {
  rows?: RagIndexRow[];
  total?: number;
  [key: string]: unknown;
}
export type RagIndexListResponse = RagResponse<RagIndexListData>;

/** GET index/files document row */
export interface RagIndexFileRow {
  doc_id?: string;
  doc_name?: string;
  doc_type?: string;
  status?: string;
  size?: number | string;
  ingestion_id?: string;
  [key: string]: unknown;
}
export interface RagIndexFilesData {
  rows?: RagIndexFileRow[];
  total_count?: number;
  [key: string]: unknown;
}
export type RagIndexFilesResponse = RagResponse<RagIndexFilesData>;

/**
 * GET index_job/status (verified against the live API)
 * Gotcha: the overall job state lives in `ingestion_status` (PENDING/RUNNING/COMPLETED,
 * no FAILED value); the per-document list is `rows[]` (not docs[]), and failures
 * surface via `rows[].code` (e.g. PARSE_FAILED).
 */
export interface RagIndexJobDoc {
  doc_id?: string;
  doc_name?: string;
  doc_type?: string;
  /** Fine-grained processing status code: FINISH / PARSE_FAILED / ... */
  code?: string;
  status?: string;
  message?: string;
  size?: number | string;
  ingestion_id?: string;
  [key: string]: unknown;
}
export interface RagIndexJobStatusData {
  /** Overall job state: PENDING / RUNNING / COMPLETED */
  ingestion_status?: string;
  ingestion_message?: string;
  rows?: RagIndexJobDoc[];
  total_count?: number;
  [key: string]: unknown;
}
export type RagIndexJobStatusResponse = RagResponse<RagIndexJobStatusData>;

/** Common response envelope for the connector domain (top-level requestId is camelCase — unlike the indices domain) */
export interface RagConnectorResponse<T> {
  code?: string;
  message?: string;
  requestId?: string;
  success?: boolean;
  status?: number | string;
  data: T;
  [key: string]: unknown;
}

/** POST applyFileUploadLease */
export interface RagUploadLeaseParam {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}
export interface RagUploadLeaseData {
  type?: string;
  leaseId?: string;
  param?: RagUploadLeaseParam;
  [key: string]: unknown;
}
export type RagUploadLeaseResponse = RagConnectorResponse<RagUploadLeaseData>;

/** POST addFile */
export interface RagAddFileData {
  fileId?: string;
  parser?: string;
  [key: string]: unknown;
}
export type RagAddFileResponse = RagConnectorResponse<RagAddFileData>;

/** POST listCategory */
export interface RagCategory {
  categoryId?: string;
  categoryName?: string;
  isDefault?: boolean;
  [key: string]: unknown;
}
export interface RagListCategoryData {
  categoryList?: RagCategory[];
  nextToken?: string;
  [key: string]: unknown;
}
export type RagListCategoryResponse = RagConnectorResponse<RagListCategoryData>;

/** POST index/job/create (incremental import; response field names pending live verification) */
export interface RagJobCreateData {
  ingestionId?: string;
  [key: string]: unknown;
}
export type RagJobCreateResponse = RagResponse<RagJobCreateData>;

/** POST index/create_v2 */
export interface RagCreateIndexV2Data {
  pipelineId?: string;
  ingestionId?: string;
  status?: string;
  [key: string]: unknown;
}
export type RagCreateIndexV2Response = RagResponse<RagCreateIndexV2Data>;

/** POST index/update and index/delete — data carries no details (empty object or absent) */
export type RagMutationResponse = RagResponse<Record<string, unknown> | undefined>;

/** POST index/delete_file — data.deleted lists the document IDs actually deleted */
export interface RagDeleteFileData {
  deleted?: string[];
  [key: string]: unknown;
}
export type RagDeleteFileResponse = RagResponse<RagDeleteFileData>;

/** POST batchUpdateFileTag — connector-domain envelope, data is an empty object */
export type RagBatchUpdateTagResponse = RagConnectorResponse<Record<string, unknown> | undefined>;

// ---- agent domain (retrieval / chat service management) ----
// Parameters are snake_case; responses use the indices-domain envelope.
// Time fields are loosely modeled as string | number (live samples show
// millisecond timestamps; tighten once verified).

/** agent_config — chat and search scenes carry different field sets; modeled loosely as one type */
export interface RagAgentConfig {
  agent_policy?: string;
  agent_model?: string;
  enable_session_file?: string;
  enable_refusal?: string;
  enable_anti_leak?: string;
  enable_rich_text?: string;
  enable_citation?: string;
  temperature?: number;
  max_num_llm_calls?: number;
  max_completion_tokens?: number;
  session_file_max_parse_length?: number;
  enable_kb_router?: string;
  kb_router_model?: string;
  rerank_top_n?: number;
  hybrid_rerank?: Record<string, unknown>;
  kb_search_configs?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** agent/list row */
export interface RagAgentRow {
  agent_id?: string;
  agent_name?: string;
  agent_scene?: string;
  agent_status?: string;
  agent_version?: string;
  create_time?: string | number;
  modify_time?: string | number;
  pipeline_list?: Array<{ pipeline_id?: string; pipeline_name?: string }>;
  [key: string]: unknown;
}
export interface RagAgentListData {
  page_number?: number;
  page_size?: number;
  total_count?: number;
  rows?: RagAgentRow[];
  [key: string]: unknown;
}
export type RagAgentListResponse = RagResponse<RagAgentListData>;

/** agent/get per-version detail */
export interface RagAgentDetail {
  agent_version?: string;
  agent_version_desc?: string | null;
  publish_time?: string | number;
  agent_config?: RagAgentConfig;
  [key: string]: unknown;
}
export interface RagAgentGetData {
  agent_id?: string;
  agent_name?: string;
  agent_desc?: string;
  agent_scene?: string;
  agent_status?: string;
  create_time?: string | number;
  modify_time?: string | number;
  agent_details?: RagAgentDetail[];
  [key: string]: unknown;
}
export type RagAgentGetResponse = RagResponse<RagAgentGetData>;

/** agent/create · update · deploy · delete · copy — union of the data field sets */
export interface RagAgentMutationData {
  agent_id?: string;
  agent_name?: string;
  agent_version?: string;
  agent_status?: string;
  [key: string]: unknown;
}
export type RagAgentMutationResponse = RagResponse<RagAgentMutationData>;

// ---- chunk / monitor / category / file / connector / oss-import ----

/** POST index/chunklist — nodes[].metadata carries the chunk payload */
export interface RagChunkNodeMetadata {
  _id?: string;
  doc_id?: string;
  doc_name?: string;
  title?: string;
  content?: string;
  hier_title?: string;
  is_displayed_chunk_content?: boolean;
  _chunk_status_message?: string;
  [key: string]: unknown;
}
export interface RagChunkNode {
  score?: number;
  text?: string;
  metadata?: RagChunkNodeMetadata;
  [key: string]: unknown;
}
export interface RagChunkListData {
  total?: number;
  nodes?: RagChunkNode[];
  [key: string]: unknown;
}
export type RagChunkListResponse = RagResponse<RagChunkListData>;

/** POST index/monitor — timestamps are second-precision strings.
 * Shape verified against the live API: both monitor fields are objects,
 * not arrays as the public docs' empty-array examples suggest. */
export interface RagStorageMonitorData {
  indexStorageLimit?: number;
  indexStorageUsage?: number;
  [key: string]: unknown;
}
export interface RagQpsMonitorData {
  peakQps?: number;
  monitorData?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
export interface RagMonitorData {
  pipelineCommercialType?: string;
  storageMonitorData?: RagStorageMonitorData;
  qpsMonitorData?: RagQpsMonitorData;
  [key: string]: unknown;
}
export type RagMonitorResponse = RagResponse<RagMonitorData>;

/** POST addCategory */
export interface RagAddCategoryData {
  categoryId?: string;
  [key: string]: unknown;
}
export type RagAddCategoryResponse = RagConnectorResponse<RagAddCategoryData>;

/** POST listFile / describeFile — field names verified against the live API:
 * sizeBytes/uploadTime/category (not sizeInBytes/createTime/categoryId as the public docs state) */
export interface RagDataCenterFile {
  fileId?: string;
  fileName?: string;
  fileType?: string;
  parser?: string;
  sizeBytes?: number | string;
  md5?: string;
  status?: string;
  tags?: string[] | string;
  category?: string;
  uploadTime?: string;
  parseErrorMessage?: string;
  [key: string]: unknown;
}
export interface RagListFileData {
  fileList?: RagDataCenterFile[];
  nextToken?: string;
  hasNext?: boolean;
  [key: string]: unknown;
}
export type RagListFileResponse = RagConnectorResponse<RagListFileData>;
export type RagDescribeFileResponse = RagConnectorResponse<RagDataCenterFile>;

/** POST addConnector / getConnector */
export interface RagConnectorInfo {
  connectorId?: string;
  connectorName?: string;
  description?: string;
  connectorType?: string;
  fileConnectorConfig?: {
    storeType?: string;
    ossRegionId?: string;
    ossBucket?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
export type RagAddConnectorResponse = RagConnectorResponse<RagConnectorInfo>;
export type RagGetConnectorResponse = RagConnectorResponse<RagConnectorInfo>;

/** POST addFilesFromAuthorizedOss */
export interface RagOssImportData {
  fileIds?: string[];
  [key: string]: unknown;
}
export type RagOssImportResponse = RagConnectorResponse<RagOssImportData>;
