// API path builders — return the path only; the Client prepends the
// credential's baseUrl. Commands never see baseUrl.

// ---- Chat (OpenAI Compatible) ----
export function chatPath(): string {
  return "/compatible-mode/v1/chat/completions";
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

// ---- MCP Services (Streamable HTTP) ----
export function mcpWebSearchPath(): string {
  return "/api/v1/mcps/WebSearch/mcp";
}
