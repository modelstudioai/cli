import type { Region } from "../config/schema.ts";

const MODEL_STUDIO_HOSTS: Record<Region, string> = {
  cn: "modelstudio.cn-beijing.aliyuncs.com",
  us: "modelstudio.cn-beijing.aliyuncs.com",
  intl: "modelstudio.ap-southeast-1.aliyuncs.com",
};

/** ModelStudio POP OpenAPI host for the given DashScope region preset. */
export function modelStudioHost(region: Region): string {
  return MODEL_STUDIO_HOSTS[region] ?? MODEL_STUDIO_HOSTS.cn;
}

// ---- Chat (OpenAI Compatible) ----

export function chatEndpoint(baseUrl: string): string {
  return `${baseUrl}/compatible-mode/v1/chat/completions`;
}

// ---- Image Generation (DashScope) ----

export function imageEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/aigc/image-generation/generation`;
}

// Synchronous image generation (qwen-image-2.0 / qwen-image-max series)
export function imageSyncEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`;
}

// ---- Video Generation (DashScope) ----

export function videoGenerateEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`;
}

// ---- Async Task Query ----

export function taskEndpoint(baseUrl: string, taskId: string): string {
  return `${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`;
}

// ---- Application (Agent / Workflow) ----

export function appCompletionEndpoint(baseUrl: string, appId: string): string {
  return `${baseUrl}/api/v1/apps/${encodeURIComponent(appId)}/completion`;
}

// ---- Memory (DashScope v2) ----

export function memoryAddEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v2/apps/memory/add`;
}

export function memorySearchEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v2/apps/memory/memory_nodes/search`;
}

export function memoryListEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v2/apps/memory/memory_nodes`;
}

export function memoryNodeEndpoint(baseUrl: string, nodeId: string): string {
  return `${baseUrl}/api/v2/apps/memory/memory_nodes/${encodeURIComponent(nodeId)}`;
}

// ---- Speech Synthesis (TTS) ----

export function speechSynthesizeEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/audio/tts/SpeechSynthesizer`;
}

// ---- Speech Recognition (ASR) ----

export function speechRecognizeEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/audio/asr/transcription`;
}

// ---- Memory Profile (DashScope v2) ----

export function profileSchemaEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v2/apps/memory/profile_schemas`;
}

export function userProfileEndpoint(baseUrl: string, schemaId: string): string {
  return `${baseUrl}/api/v2/apps/memory/profile_schemas/${encodeURIComponent(schemaId)}/profiles`;
}

// ---- Knowledge Base Retrieve (DashScope) ----

export function knowledgeRetrieveEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v1/indices/rag/index/retrieve`;
}

// ---- MCP Services (Streamable HTTP) ----

export function mcpWebSearchEndpoint(baseUrl: string): string {
  return `${baseUrl}/api/v1/mcps/WebSearch/mcp`;
}
