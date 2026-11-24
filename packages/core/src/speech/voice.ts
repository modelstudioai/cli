/**
 * Voice enrollment HTTP API wrappers (clone / design / manage).
 *
 * Thin functions over `requestJson`. Bodies and responses stay snake_case so
 * callers can surface fields without remapping.
 */
import { speechVoiceCustomizationPath } from "../client/endpoints.ts";
import type { Client } from "../client/client.ts";

/** Fixed model id for the voice customization endpoint. */
export const VOICE_ENROLLMENT_MODEL = "voice-enrollment";

export type VoiceAction =
  | "create_voice"
  | "list_voice"
  | "query_voice"
  | "update_voice"
  | "delete_voice";

export interface VoicePreviewAudio {
  data?: string;
  sample_rate?: number;
  response_format?: string;
}

export interface VoiceListItem {
  voice_id?: string;
  gmt_create?: string;
  gmt_modified?: string;
  /** DEPLOYING | OK | UNDEPLOYED */
  status?: string;
  target_model?: string;
  voice_prompt?: string;
  preview_text?: string;
}

export interface VoiceQueryOutput {
  voice_id?: string;
  gmt_create?: string;
  gmt_modified?: string;
  status?: string;
  target_model?: string;
  /** Reference audio URL for cloned voices; not guaranteed for design voices. */
  resource_link?: string;
  voice_prompt?: string;
  preview_text?: string;
  preview_audio?: VoicePreviewAudio;
}

export interface VoiceCreateOutput {
  voice_id?: string;
  target_model?: string;
  preview_audio?: VoicePreviewAudio;
  request_id?: string;
}

export interface VoiceEnvelope<T> {
  request_id?: string;
  output?: T;
  usage?: { count?: number };
  code?: string;
  message?: string;
}

export interface VoiceRequest {
  model: string;
  input: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

/** Clone create input (reference audio). */
export interface CreateCloneVoiceInput {
  target_model: string;
  prefix: string;
  audio: string;
  language_hints?: string[];
  enable_volume_normalization?: string;
  max_prompt_audio_length?: number;
  enable_preprocess?: boolean;
}

/** Design create input (text prompt). Mutually exclusive with audio. */
export interface CreateDesignVoiceInput {
  target_model: string;
  prefix: string;
  voice_prompt: string;
  preview_text: string;
  language_hints?: string[];
}

export interface CreateVoiceParameters {
  sample_rate?: number;
  response_format?: string;
}

/** Shared request body builder for dry-run and live calls. */
export function buildVoiceRequest(
  action: VoiceAction,
  input: Record<string, unknown>,
  parameters?: Record<string, unknown>,
): VoiceRequest {
  const request: VoiceRequest = {
    model: VOICE_ENROLLMENT_MODEL,
    input: { action, ...input },
  };
  if (parameters !== undefined && Object.keys(parameters).length > 0) {
    request.parameters = parameters;
  }
  return request;
}

/** POST a pre-built voice request (shared by dry-run builders and live calls). */
export function postVoiceRequest<T>(
  client: Client,
  request: VoiceRequest,
  signal?: AbortSignal,
): Promise<VoiceEnvelope<T>> {
  return client.requestJson<VoiceEnvelope<T>>({
    path: speechVoiceCustomizationPath(),
    method: "POST",
    body: request,
    signal,
  });
}

async function callVoiceApi<T>(
  client: Client,
  action: VoiceAction,
  input: Record<string, unknown>,
  options?: { parameters?: Record<string, unknown>; signal?: AbortSignal },
): Promise<VoiceEnvelope<T>> {
  return postVoiceRequest(
    client,
    buildVoiceRequest(action, input, options?.parameters),
    options?.signal,
  );
}

function omitUndefined(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function createCloneVoice(
  client: Client,
  input: CreateCloneVoiceInput,
  signal?: AbortSignal,
): Promise<VoiceEnvelope<VoiceCreateOutput>> {
  return callVoiceApi(client, "create_voice", omitUndefined({ ...input }), { signal });
}

export function createDesignVoice(
  client: Client,
  input: CreateDesignVoiceInput,
  parameters?: CreateVoiceParameters,
  signal?: AbortSignal,
): Promise<VoiceEnvelope<VoiceCreateOutput>> {
  const params = parameters ? omitUndefined({ ...parameters }) : undefined;
  return callVoiceApi(client, "create_voice", omitUndefined({ ...input }), {
    parameters: params && Object.keys(params).length > 0 ? params : undefined,
    signal,
  });
}

export function listVoices(
  client: Client,
  params: { prefix?: string; pageIndex?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<VoiceEnvelope<{ voice_list?: VoiceListItem[] }>> {
  const input = omitUndefined({
    prefix: params.prefix,
    page_index: params.pageIndex,
    page_size: params.pageSize,
  });
  return callVoiceApi(client, "list_voice", input, { signal });
}

export function queryVoice(
  client: Client,
  voiceId: string,
  signal?: AbortSignal,
): Promise<VoiceEnvelope<VoiceQueryOutput>> {
  return callVoiceApi(client, "query_voice", { voice_id: voiceId }, { signal });
}

export function updateVoice(
  client: Client,
  voiceId: string,
  audio: string,
  signal?: AbortSignal,
): Promise<VoiceEnvelope<Record<string, never>>> {
  return callVoiceApi(client, "update_voice", { voice_id: voiceId, audio }, { signal });
}

export function deleteVoice(
  client: Client,
  voiceId: string,
  signal?: AbortSignal,
): Promise<VoiceEnvelope<Record<string, never>>> {
  return callVoiceApi(client, "delete_voice", { voice_id: voiceId }, { signal });
}
