/**
 * Fine-tune job HTTP API wrappers.
 *
 * Thin functions over `requestJson`. They return the parsed body verbatim
 * (snake_case) so callers can decide how to surface fields.
 */
import {
  finetuneJobsPath,
  finetuneJobPath,
  finetuneCancelPath,
  finetuneLogsPath,
  finetuneCheckpointsPath,
  finetuneExportPath,
  finetuneParamsPath,
  finetuneBasicMetricsPath,
} from "../client/endpoints.ts";
import type { Client } from "../client/client.ts";
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
  GetFineTuneParamsResponse,
  ListBasicMetricsResponse,
} from "./types.ts";

/** POST /api/v1/fine-tunes */
export async function createFineTune(
  client: Client,
  body: CreateFineTuneRequest,
  signal?: AbortSignal,
): Promise<CreateFineTuneResponse> {
  return client.requestJson<CreateFineTuneResponse>({
    path: finetuneJobsPath(),
    method: "POST",
    body,
    signal,
  });
}

export interface ListFineTunesParams {
  pageNo?: number;
  pageSize?: number;
  status?: string;
  /** Filter by base model ID (server-side). */
  model?: string;
  signal?: AbortSignal;
}

/** GET /api/v1/fine-tunes */
export async function listFineTunes(
  client: Client,
  params: ListFineTunesParams = {},
): Promise<ListFineTunesResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  if (params.status) qs.set("status", params.status);
  if (params.model) qs.set("model", params.model);
  const base = finetuneJobsPath();
  const path = qs.toString() ? `${base}?${qs.toString()}` : base;
  return client.requestJson<ListFineTunesResponse>({
    path,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/fine-tunes/{job_id} */
export async function getFineTune(
  client: Client,
  jobId: string,
  signal?: AbortSignal,
): Promise<GetFineTuneResponse> {
  return client.requestJson<GetFineTuneResponse>({
    path: finetuneJobPath(jobId),
    method: "GET",
    signal,
  });
}

/** POST /api/v1/fine-tunes/{job_id}/cancel */
export async function cancelFineTune(
  client: Client,
  jobId: string,
  signal?: AbortSignal,
): Promise<CancelFineTuneResponse> {
  return client.requestJson<CancelFineTuneResponse>({
    path: finetuneCancelPath(jobId),
    method: "POST",
    signal,
  });
}

/** DELETE /api/v1/fine-tunes/{job_id} */
export async function deleteFineTune(
  client: Client,
  jobId: string,
  signal?: AbortSignal,
): Promise<DeleteFineTuneResponse> {
  return client.requestJson<DeleteFineTuneResponse>({
    path: finetuneJobPath(jobId),
    method: "DELETE",
    signal,
  });
}

export interface GetFineTuneLogsParams {
  pageNo?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

/** GET /api/v1/fine-tunes/{job_id}/logs */
export async function getFineTuneLogs(
  client: Client,
  jobId: string,
  params: GetFineTuneLogsParams = {},
): Promise<GetFineTuneLogsResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  const base = finetuneLogsPath(jobId);
  const path = qs.toString() ? `${base}?${qs.toString()}` : base;
  return client.requestJson<GetFineTuneLogsResponse>({
    path,
    method: "GET",
    signal: params.signal,
  });
}

export interface GetFineTuneParamsParams {
  /** Base model ID, e.g. qwen3-14b. */
  inputModel: string;
  /** Server training_type: sft | efficient_sft | dpo_full | dpo_lora | cpt. */
  trainingType: string;
  /** MTU spec code; forwarded when present (resource params queries). */
  mtuSpecCode?: string;
  /** `hyper` / `resource`; omit to return all groups. */
  paramType?: string;
  /**
   * Training-option context, sent as a single `hyper_parameters` query
   * parameter holding the JSON-serialized object (e.g. modality /
   * reasoning_mode). Omit when the model has no dynamic train options.
   */
  trainOptions?: Record<string, string>;
  /** Explicit locale for server-side display text; omit for the server default. */
  lang?: string;
  /** Sent as X-DashScope-WorkSpace; use the job's owning workspace. */
  workspaceId?: string;
  signal?: AbortSignal;
}

/**
 * GET /api/v1/fine-tunes/fine-tunes-params — training hyper-parameter config.
 * Empty/absent optional fields in each hyper_params entry are not failures.
 */
export async function getFineTuneParams(
  client: Client,
  params: GetFineTuneParamsParams,
): Promise<GetFineTuneParamsResponse> {
  const qs = new URLSearchParams();
  qs.set("input_model", params.inputModel);
  qs.set("training_type", params.trainingType);
  if (params.mtuSpecCode) qs.set("mtu_spec_code", params.mtuSpecCode);
  if (params.paramType) qs.set("param_type", params.paramType);
  if (params.trainOptions && Object.keys(params.trainOptions).length > 0) {
    qs.set("hyper_parameters", JSON.stringify(params.trainOptions));
  }
  if (params.lang) qs.set("lang", params.lang);
  const path = `${finetuneParamsPath()}?${qs.toString()}`;
  return client.requestJson<GetFineTuneParamsResponse>({
    path,
    method: "GET",
    headers: params.workspaceId ? { "X-DashScope-WorkSpace": params.workspaceId } : undefined,
    signal: params.signal,
  });
}

export interface ListBasicMetricsParams {
  pageNo?: number;
  pageSize?: number;
  /** Sent as X-DashScope-WorkSpace; use the job's owning workspace. */
  workspaceId?: string;
  signal?: AbortSignal;
}

/**
 * GET /api/v1/fine-tunes/{job_id}/basic_metrics — training metrics.
 * An empty `output.metrics` list is a normal result. No server-side metric
 * type filter: the full result is returned and callers pick metric keys.
 */
export async function listBasicMetrics(
  client: Client,
  jobId: string,
  params: ListBasicMetricsParams = {},
): Promise<ListBasicMetricsResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  const base = finetuneBasicMetricsPath(jobId);
  const path = qs.toString() ? `${base}?${qs.toString()}` : base;
  return client.requestJson<ListBasicMetricsResponse>({
    path,
    method: "GET",
    headers: params.workspaceId ? { "X-DashScope-WorkSpace": params.workspaceId } : undefined,
    signal: params.signal,
  });
}

/** GET /api/v1/fine-tunes/{job_id}/checkpoints */
export async function listCheckpoints(
  client: Client,
  jobId: string,
  signal?: AbortSignal,
): Promise<ListCheckpointsResponse> {
  return client.requestJson<ListCheckpointsResponse>({
    path: finetuneCheckpointsPath(jobId),
    method: "GET",
    signal,
  });
}

/**
 * GET /api/v1/fine-tunes/{job_id}/export/{checkpoint}?model_name={name}
 *
 * Publishes a training checkpoint as a deployable model — required before
 * `deploy <modality> create` can target it. The platform may auto-export the best
 * checkpoint on SUCCEEDED, but explicit export is the canonical path.
 */
export async function exportCheckpoint(
  client: Client,
  jobId: string,
  checkpoint: string,
  modelName: string,
  signal?: AbortSignal,
): Promise<ExportCheckpointResponse> {
  const qs = new URLSearchParams();
  qs.set("model_name", modelName);
  return client.requestJson<ExportCheckpointResponse>({
    path: `${finetuneExportPath(jobId, checkpoint)}?${qs.toString()}`,
    method: "GET",
    signal,
  });
}
