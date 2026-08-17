// API path builders — return the path only; the Client prepends the
// credential's baseUrl. Commands never see baseUrl.

// ---- Chat (OpenAI Compatible) ----
export function chatPath(): string {
  return "/compatible-mode/v1/chat/completions";
}

// ---- Responses (OpenAI Compatible) ----
export function responsesPath(): string {
  return "/compatible-mode/v1/responses";
}

// ---- Image Generation (DashScope) ----
/** Async image API used by wan2.6-t2i / wan2.6-image (T2I) and similar message-format models. */
export function imagePath(): string {
  return "/api/v1/services/aigc/image-generation/generation";
}

/** Sync multimodal API (qwen-image / wan2.7-image / z-image generate; also wan2.6-image edit). */
export function imageSyncPath(): string {
  return "/api/v1/services/aigc/multimodal-generation/generation";
}

/** Legacy async text-to-image API (wan2.5/2.2/2.1-t2i, wanx-*-t2i). */
export function imageText2ImagePath(): string {
  return "/api/v1/services/aigc/text2image/image-synthesis";
}

/** Legacy async image-to-image / edit API (wan2.5-i2i, *imageedit*). */
export function image2ImagePath(): string {
  return "/api/v1/services/aigc/image2image/image-synthesis";
}

// ---- Video Generation (DashScope) ----
export function videoGeneratePath(): string {
  return "/api/v1/services/aigc/video-generation/video-synthesis";
}

// ---- Async Task Query ----
export function taskPath(taskId: string): string {
  return `/api/v1/tasks/${encodeURIComponent(taskId)}`;
}

// ---- Model Rate Limits (DashScope) ----
export function modelsLimitsPath(): string {
  return "/api/v1/models/limits";
}

// ---- Model Permissions (DashScope) ----
export function modelsPermissionsPath(): string {
  return "/api/v1/models/permissions";
}

// ---- Application (Agent / Workflow) ----
export function appCompletionPath(appId: string): string {
  return `/api/v1/apps/${encodeURIComponent(appId)}/completion`;
}

// ---- Memory (DashScope v2) ----
export function memoryAddPath(): string {
  return "/api/v2/apps/memory/add";
}

export function memorySearchPath(): string {
  return "/api/v2/apps/memory/memory_nodes/search";
}

export function memoryListPath(): string {
  return "/api/v2/apps/memory/memory_nodes";
}

export function memoryNodePath(nodeId: string): string {
  return `/api/v2/apps/memory/memory_nodes/${encodeURIComponent(nodeId)}`;
}

// ---- Speech Synthesis (TTS) ----
export function speechSynthesizePath(): string {
  return "/api/v1/services/audio/tts/SpeechSynthesizer";
}

// ---- Speech Recognition (ASR) ----
export function speechRecognizePath(): string {
  return "/api/v1/services/audio/asr/transcription";
}

// ---- Memory Profile (DashScope v2) ----
export function profileSchemaPath(): string {
  return "/api/v2/apps/memory/profile_schemas";
}

export function userProfilePath(schemaId: string): string {
  return `/api/v2/apps/memory/profile_schemas/${encodeURIComponent(schemaId)}/profiles`;
}

// ---- Knowledge Base Retrieve (DashScope) ----
export function knowledgeRetrievePath(): string {
  return "/api/v1/indices/rag/index/retrieve";
}

// ---- Knowledge Search (新版 RAG 检索, workspace-based host) ----

export function knowledgeSearchEndpoint(workspaceId: string): string {
  return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/indices/knowledge/search`;
}

// ---- Knowledge Chat (新版 RAG 问答, workspace-based host) ----

export function knowledgeChatEndpoint(workspaceId: string): string {
  return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/api/v2/apps/knowledge/chat`;
}

// ---- MCP Services (Streamable HTTP) ----
export function mcpWebSearchPath(): string {
  return "/api/v1/mcps/WebSearch/mcp";
}

// ---- Datasets / Fine-tune Files ----

/**
 * Upload endpoint — the OpenAI-compatible `/compatible-mode/v1/files`.
 *
 * We use the OpenAI-compatible path (not `/api/v1/files`) because it is the
 * only one that persists the `purpose` field. The DashScope-native
 * `/api/v1/files` silently drops `purpose`, so uploaded files show up in
 * `list`/`get` with an empty purpose. Files uploaded here still appear in the
 * `/api/v1/files` listing (with purpose intact), so list/get/delete keep using
 * the native endpoint below.
 *
 * Form fields: `file` (singular) + `purpose`. `descriptions` is NOT accepted
 * (the endpoint rejects unknown fields with HTTP 400).
 */
export function datasetUploadPath(): string {
  return "/compatible-mode/v1/files";
}

/** List (GET) endpoint — DashScope-native `/api/v1/files`. */
export function datasetListPath(): string {
  return "/api/v1/files";
}

/** Single-file get / delete endpoint. */
export function datasetFilePath(fileId: string): string {
  return `/api/v1/files/${encodeURIComponent(fileId)}`;
}

// ---- Fine-tune Jobs (DashScope /api/v1/fine-tunes) ----

/** Create (POST) and list (GET) endpoint. */
export function finetuneJobsPath(): string {
  return "/api/v1/fine-tunes";
}

/** Single-job get / delete endpoint. */
export function finetuneJobPath(jobId: string): string {
  return `/api/v1/fine-tunes/${encodeURIComponent(jobId)}`;
}

/** POST /api/v1/fine-tunes/{job_id}/cancel */
export function finetuneCancelPath(jobId: string): string {
  return `/api/v1/fine-tunes/${encodeURIComponent(jobId)}/cancel`;
}

/** GET /api/v1/fine-tunes/{job_id}/logs */
export function finetuneLogsPath(jobId: string): string {
  return `/api/v1/fine-tunes/${encodeURIComponent(jobId)}/logs`;
}

/** GET /api/v1/fine-tunes/{job_id}/checkpoints */
export function finetuneCheckpointsPath(jobId: string): string {
  return `/api/v1/fine-tunes/${encodeURIComponent(jobId)}/checkpoints`;
}

/** GET /api/v1/fine-tunes/{job_id}/export/{checkpoint} */
export function finetuneExportPath(jobId: string, checkpoint: string): string {
  return `/api/v1/fine-tunes/${encodeURIComponent(jobId)}/export/${encodeURIComponent(checkpoint)}`;
}

// ---- Model Deployments (DashScope /api/v1/deployments) ----

/** POST (create) and GET (list) endpoint. */
export function deploymentsPath(): string {
  return "/api/v1/deployments";
}

/**
 * Single-deployment endpoint:
 *   GET    — describe
 *   DELETE — destroy (must be STOPPED/FAILED)
 *
 * Note: rate-limit update has its own `/update` suffix endpoint, NOT a PUT
 * on this resource root. See `deploymentUpdateEndpoint`.
 */
export function deploymentPath(deployedModel: string): string {
  return `/api/v1/deployments/${encodeURIComponent(deployedModel)}`;
}

/** PUT /api/v1/deployments/{deployed_model}/scale — capacity adjust. */
export function deploymentScalePath(deployedModel: string): string {
  return `/api/v1/deployments/${encodeURIComponent(deployedModel)}/scale`;
}

/**
 * PUT /api/v1/deployments/{deployed_model}/update — rate-limit update.
 * Body: at least one of `rpm_limit` / `tpm_limit`.
 */
export function deploymentUpdatePath(deployedModel: string): string {
  return `/api/v1/deployments/${encodeURIComponent(deployedModel)}/update`;
}

/** GET /api/v1/deployments/models — deployable models catalog. */
export function deploymentsModelsPath(): string {
  return "/api/v1/deployments/models";
}

// ---- RAG admin plane (knowledge base / data center / service management, workspace-based host) ----
// All admin endpoints go through this factory; path constants are centralized in
// RAG_PATHS to avoid per-endpoint boilerplate.

export function ragEndpoint(workspaceId: string, path: string): string {
  return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com${path}`;
}

export const RAG_PATHS = {
  // indices domain — knowledge bases / documents / chunks / import jobs.
  // Note: parameter naming is inconsistent across endpoints; see per-path comments.
  indexList: "/api/v1/indices/rag/index/list", // GET, pagination/filters go in the query string
  indexCreateV2: "/api/v1/indices/rag/index/create_v2", // POST
  indexUpdate: "/api/v1/indices/rag/index/update", // POST, index id parameter is named `id`
  indexDelete: "/api/v1/indices/rag/index/delete", // POST, body { index_id }
  indexMonitor: "/api/v1/indices/rag/index/monitor", // POST, second-precision string timestamps
  indexFiles: "/api/v1/indices/rag/index/files", // GET, page parameter is page_num
  indexDeleteFile: "/api/v1/indices/rag/index/delete_file", // POST, body { index_id, doc_ids }
  indexJobCreate: "/api/v1/indices/rag/index/job/create", // POST, body requires nested dataSource { sourceType, fileIds } (flat documentIds from the docs is rejected)
  indexJobStatus: "/api/v1/indices/rag/index_job/status", // GET, both index_id and job_id required
  chunkList: "/api/v1/indices/rag/index/chunklist", // POST, body pageNum/pageSize
  chunkCreate: "/api/v1/indices/rag/index/chunk/create", // POST, parameter is pipelineId; rate limit 10 req/s, no chunk_id in response
  chunkUpdate: "/api/v1/indices/rag/index/chunk/update", // POST, parameter is pipelineId
  chunkDelete: "/api/v1/indices/rag/index/chunk/delete", // POST, at most 10 per request
  // agent domain — retrieval / chat services. The actual gateway prefix is rag/app/,
  // not rag/agent/ as the public API docs state — the wrong path returns console HTML
  // instead of an API response.
  agentList: "/api/v1/indices/rag/app/list", // POST, agent_scene required
  agentGet: "/api/v1/indices/rag/app/get", // POST
  agentCreate: "/api/v1/indices/rag/app/create", // POST
  agentUpdate: "/api/v1/indices/rag/app/update", // POST, config is only mutable on the beta draft
  agentDeploy: "/api/v1/indices/rag/app/deploy", // POST
  agentDelete: "/api/v1/indices/rag/app/delete", // POST, idempotent soft delete
  agentCopy: "/api/v1/indices/rag/app/copy", // POST
  // connector domain — data center (responses use requestId; cursor pagination via nextToken/maxResult)
  applyFileUploadLease: "/api/v1/connector/dash/applyFileUploadLease", // sizeBytes must be a string
  addFile: "/api/v1/connector/dash/addFile",
  addFilesFromAuthorizedOss: "/api/v1/connector/dash/addFilesFromAuthorizedOss",
  batchUpdateFileTag: "/api/v1/connector/dash/batchUpdateFileTag",
  listFile: "/api/v1/connector/dash/listFile", // categoryId required
  describeFile: "/api/v1/connector/dash/describeFile",
  deleteFile: "/api/v1/connector/dash/deleteFile",
  addConnector: "/api/v1/connector/dash/addConnector",
  getConnector: "/api/v1/connector/dash/getConnector",
  listCategory: "/api/v1/connector/dash/listCategory", // note: maxResult is singular
  addCategory: "/api/v1/connector/dash/addCategory",
  deleteCategory: "/api/v1/connector/dash/deleteCategory",
} as const;
