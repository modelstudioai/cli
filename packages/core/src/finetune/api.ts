/**
 * Fine-tune job HTTP API wrappers.
 *
 * Thin functions over `requestJson`. They return the parsed body verbatim
 * (snake_case) so callers can decide how to surface fields.
 */
import { requestJson } from "../client/http.ts";
import {
  finetuneJobsEndpoint,
  finetuneJobEndpoint,
  finetuneCancelEndpoint,
  finetuneLogsEndpoint,
  finetuneCheckpointsEndpoint,
  finetuneExportEndpoint,
} from "../client/endpoints.ts";
import type { Config } from "../config/schema.ts";
import type {
  CreateFineTuneRequest,
  CreateFineTuneResponse,
  ListFineTunesResponse,
  GetFineTuneResponse,
  CancelFineTuneResponse,
  DeleteFineTuneResponse,
  GetFineTuneLogsResponse,
  ListCheckpointsResponse,
  ExportCheckpointResponse,
} from "./types.ts";

/** POST /api/v1/fine-tunes */
export async function createFineTune(
  config: Config,
  body: CreateFineTuneRequest,
  signal?: AbortSignal,
): Promise<CreateFineTuneResponse> {
  const url = finetuneJobsEndpoint(config.baseUrl);
  return requestJson<CreateFineTuneResponse>(config, {
    url,
    method: "POST",
    body,
    signal,
  });
}

export interface ListFineTunesParams {
  pageNo?: number;
  pageSize?: number;
  status?: string;
  signal?: AbortSignal;
}

/** GET /api/v1/fine-tunes */
export async function listFineTunes(
  config: Config,
  params: ListFineTunesParams = {},
): Promise<ListFineTunesResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  if (params.status) qs.set("status", params.status);
  const base = finetuneJobsEndpoint(config.baseUrl);
  const url = qs.toString() ? `${base}?${qs.toString()}` : base;
  return requestJson<ListFineTunesResponse>(config, {
    url,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/fine-tunes/{job_id} */
export async function getFineTune(
  config: Config,
  jobId: string,
  signal?: AbortSignal,
): Promise<GetFineTuneResponse> {
  const url = finetuneJobEndpoint(config.baseUrl, jobId);
  return requestJson<GetFineTuneResponse>(config, { url, method: "GET", signal });
}

/** POST /api/v1/fine-tunes/{job_id}/cancel */
export async function cancelFineTune(
  config: Config,
  jobId: string,
  signal?: AbortSignal,
): Promise<CancelFineTuneResponse> {
  const url = finetuneCancelEndpoint(config.baseUrl, jobId);
  return requestJson<CancelFineTuneResponse>(config, { url, method: "POST", signal });
}

/** DELETE /api/v1/fine-tunes/{job_id} */
export async function deleteFineTune(
  config: Config,
  jobId: string,
  signal?: AbortSignal,
): Promise<DeleteFineTuneResponse> {
  const url = finetuneJobEndpoint(config.baseUrl, jobId);
  return requestJson<DeleteFineTuneResponse>(config, { url, method: "DELETE", signal });
}

export interface GetFineTuneLogsParams {
  pageNo?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

/** GET /api/v1/fine-tunes/{job_id}/logs */
export async function getFineTuneLogs(
  config: Config,
  jobId: string,
  params: GetFineTuneLogsParams = {},
): Promise<GetFineTuneLogsResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  const base = finetuneLogsEndpoint(config.baseUrl, jobId);
  const url = qs.toString() ? `${base}?${qs.toString()}` : base;
  return requestJson<GetFineTuneLogsResponse>(config, {
    url,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/fine-tunes/{job_id}/checkpoints */
export async function listCheckpoints(
  config: Config,
  jobId: string,
  signal?: AbortSignal,
): Promise<ListCheckpointsResponse> {
  const url = finetuneCheckpointsEndpoint(config.baseUrl, jobId);
  return requestJson<ListCheckpointsResponse>(config, { url, method: "GET", signal });
}

/**
 * GET /api/v1/fine-tunes/{job_id}/export/{checkpoint}?model_name={name}
 *
 * Publishes a training checkpoint as a deployable model — required before
 * `bl deploy create` can target it. The platform may auto-export the best
 * checkpoint on SUCCEEDED, but explicit export is the canonical path.
 */
export async function exportCheckpoint(
  config: Config,
  jobId: string,
  checkpoint: string,
  modelName: string,
  signal?: AbortSignal,
): Promise<ExportCheckpointResponse> {
  const qs = new URLSearchParams();
  qs.set("model_name", modelName);
  const base = finetuneExportEndpoint(config.baseUrl, jobId, checkpoint);
  const url = `${base}?${qs.toString()}`;
  return requestJson<ExportCheckpointResponse>(config, { url, method: "GET", signal });
}
