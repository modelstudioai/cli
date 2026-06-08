import type { Config } from "../config/schema.ts";
import {
  CODING_PLAN_BASE_URLS,
  TOKEN_PLAN_BASE_URLS,
  TOKEN_PLAN_NATIVE_BASE_URLS,
} from "../auth/resolver.ts";

// ---- Mode-aware base URL resolution ----

type EndpointBase = string | Config;

export function compatibleBaseUrl(config: Config): string {
  if (config.activeAuthMode === "coding-plan") {
    return CODING_PLAN_BASE_URLS[config.codingPlanRegion];
  }
  if (config.activeAuthMode === "token-plan") {
    return TOKEN_PLAN_BASE_URLS[config.tokenPlanRegion];
  }
  return `${config.baseUrl}/compatible-mode/v1`;
}

export function nativeBaseUrl(config: Config): string {
  if (config.activeAuthMode === "token-plan") {
    return TOKEN_PLAN_NATIVE_BASE_URLS[config.tokenPlanRegion];
  }
  return config.baseUrl;
}

function resolveEndpointBase(base: EndpointBase): string {
  return typeof base === "string" ? base : nativeBaseUrl(base);
}

// ---- Chat (OpenAI Compatible) ----

export function chatEndpoint(baseUrl: EndpointBase): string {
  const compatibleBase =
    typeof baseUrl === "string" ? `${baseUrl}/compatible-mode/v1` : compatibleBaseUrl(baseUrl);
  return `${compatibleBase}/chat/completions`;
}

// ---- Image Generation (DashScope) ----

export function imageEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v1/services/aigc/image-generation/generation`;
}

export function imageSyncEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v1/services/aigc/multimodal-generation/generation`;
}

// ---- Video Generation (DashScope) ----

export function videoGenerateEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v1/services/aigc/video-generation/video-synthesis`;
}

// ---- Async Task Query ----

export function taskEndpoint(baseUrl: EndpointBase, taskId: string): string {
  return `${resolveEndpointBase(baseUrl)}/api/v1/tasks/${encodeURIComponent(taskId)}`;
}

// ---- Application (Agent / Workflow) ----

export function appCompletionEndpoint(baseUrl: EndpointBase, appId: string): string {
  return `${resolveEndpointBase(baseUrl)}/api/v1/apps/${encodeURIComponent(appId)}/completion`;
}

// ---- Memory (DashScope v2) ----

export function memoryAddEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v2/apps/memory/add`;
}

export function memorySearchEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v2/apps/memory/memory_nodes/search`;
}

export function memoryListEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v2/apps/memory/memory_nodes`;
}

export function memoryNodeEndpoint(baseUrl: EndpointBase, nodeId: string): string {
  return `${resolveEndpointBase(baseUrl)}/api/v2/apps/memory/memory_nodes/${encodeURIComponent(nodeId)}`;
}

// ---- Speech Synthesis (TTS) ----

export function speechSynthesizeEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v1/services/audio/tts/SpeechSynthesizer`;
}

// ---- Speech Recognition (ASR) ----

export function speechRecognizeEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v1/services/audio/asr/transcription`;
}

// ---- Memory Profile (DashScope v2) ----

export function profileSchemaEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v2/apps/memory/profile_schemas`;
}

export function userProfileEndpoint(baseUrl: EndpointBase, schemaId: string): string {
  return `${resolveEndpointBase(baseUrl)}/api/v2/apps/memory/profile_schemas/${encodeURIComponent(schemaId)}/profiles`;
}

// ---- MCP Services (Streamable HTTP) ----

export function mcpWebSearchEndpoint(baseUrl: EndpointBase): string {
  return `${resolveEndpointBase(baseUrl)}/api/v1/mcps/WebSearch/mcp`;
}
