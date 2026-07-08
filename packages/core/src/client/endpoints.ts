// API path builders — return the path only; the Client prepends the
// credential's baseUrl. Commands never see baseUrl.

// ---- Chat (OpenAI Compatible) ----
export function chatPath(): string {
  return "/compatible-mode/v1/chat/completions";
}

// ---- Intent Detect (DashScope Native) ----

/**
 * DashScope-native text-generation endpoint for `tongyi-intent-detect-v3`.
 * This model does not use the OpenAI-compatible chat endpoint — it requires
 * the native `{ model, input, parameters }` request shape with
 * `result_format: "message"` and returns a `{ output, usage, request_id }`
 * envelope.
 */
export function intentDetectEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/aigc/text-generation/generation`;
}

// ---- Image Generation (DashScope) ----
export function imagePath(): string {
  return "/api/v1/services/aigc/image-generation/generation";
}

// Synchronous image generation (qwen-image-2.0 / qwen-image-max series)
export function imageSyncPath(): string {
  return "/api/v1/services/aigc/multimodal-generation/generation";
}

// ---- Video Generation (DashScope) ----
export function videoGeneratePath(): string {
  return "/api/v1/services/aigc/video-generation/video-synthesis";
}

// ---- Async Task Query ----
export function taskPath(taskId: string): string {
  return `/api/v1/tasks/${encodeURIComponent(taskId)}`;
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
