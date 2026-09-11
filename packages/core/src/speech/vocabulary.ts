/**
 * Hot-word vocabulary HTTP API wrappers.
 *
 * Thin functions over `requestJson`. They return the parsed body verbatim
 * (snake_case) so callers can decide how to surface fields.
 */
import { speechVocabularyPath } from "../client/endpoints.ts";
import type { Client } from "../client/client.ts";

/** Fixed model id for the hot-word customization endpoint. */
export const SPEECH_BIASING_MODEL = "speech-biasing";

export interface VocabularyEntry {
  text: string;
  weight: number;
  lang?: string;
}

export interface VocabularyListItem {
  vocabulary_id?: string;
  gmt_create?: string;
  gmt_modified?: string;
  /** OK | UNDEPLOYED — UNDEPLOYED vocabularies are silently ignored by ASR. */
  status?: string;
}

export interface VocabularyEnvelope<T> {
  request_id?: string;
  output?: T;
  usage?: { count?: number };
}

export interface VocabularyRequest {
  model: string;
  input: Record<string, unknown>;
}

/** Shared request body builder for dry-run and live calls. */
export function buildVocabularyRequest(
  action: string,
  input: Record<string, unknown>,
): VocabularyRequest {
  return {
    model: SPEECH_BIASING_MODEL,
    input: { action, ...input },
  };
}

async function callVocabularyApi<T>(
  client: Client,
  action: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<VocabularyEnvelope<T>> {
  return client.requestJson<VocabularyEnvelope<T>>({
    path: speechVocabularyPath(),
    method: "POST",
    body: buildVocabularyRequest(action, input),
    signal,
  });
}

export function createVocabulary(
  client: Client,
  params: { targetModel: string; prefix: string; vocabulary: VocabularyEntry[] },
  signal?: AbortSignal,
): Promise<VocabularyEnvelope<{ vocabulary_id?: string }>> {
  return callVocabularyApi(
    client,
    "create_vocabulary",
    {
      target_model: params.targetModel,
      prefix: params.prefix,
      vocabulary: params.vocabulary,
    },
    signal,
  );
}

export function listVocabularies(
  client: Client,
  params: { prefix?: string; pageIndex?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<VocabularyEnvelope<{ vocabulary_list?: VocabularyListItem[] }>> {
  const input: Record<string, unknown> = {};
  if (params.prefix !== undefined) input.prefix = params.prefix;
  if (params.pageIndex !== undefined) input.page_index = params.pageIndex;
  if (params.pageSize !== undefined) input.page_size = params.pageSize;
  return callVocabularyApi(client, "list_vocabulary", input, signal);
}

export function queryVocabulary(
  client: Client,
  vocabularyId: string,
  signal?: AbortSignal,
): Promise<
  VocabularyEnvelope<{
    gmt_create?: string;
    gmt_modified?: string;
    status?: string;
    target_model?: string;
    vocabulary?: VocabularyEntry[];
  }>
> {
  return callVocabularyApi(client, "query_vocabulary", { vocabulary_id: vocabularyId }, signal);
}

export function updateVocabulary(
  client: Client,
  vocabularyId: string,
  vocabulary: VocabularyEntry[],
  signal?: AbortSignal,
): Promise<VocabularyEnvelope<Record<string, never>>> {
  return callVocabularyApi(
    client,
    "update_vocabulary",
    { vocabulary_id: vocabularyId, vocabulary },
    signal,
  );
}

export function deleteVocabulary(
  client: Client,
  vocabularyId: string,
  signal?: AbortSignal,
): Promise<VocabularyEnvelope<Record<string, never>>> {
  return callVocabularyApi(client, "delete_vocabulary", { vocabulary_id: vocabularyId }, signal);
}
