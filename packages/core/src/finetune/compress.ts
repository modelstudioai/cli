/**
 * Model compression (quantization) HTTP API wrappers.
 *
 * Thin functions over `requestJson` for DashScope `/api/v1/fine-tunes/compress`.
 * They return the parsed body verbatim (snake_case) so callers decide how to
 * surface fields.
 */
import {
  finetuneCompressTemplatesPath,
  finetuneCompressJobsPath,
  finetuneCompressJobPath,
  finetuneCompressCancelPath,
  finetuneCompressLogsPath,
} from "../client/endpoints.ts";
import type { Client } from "../client/client.ts";
import type {
  CreateCompressJobRequest,
  CompressJobResponse,
  ListCompressJobsResponse,
  ListCompressTemplatesResponse,
  GetCompressJobLogsResponse,
  CompressJobActionResponse,
} from "./types.ts";

/** Append defined, non-empty params as a query string. */
function withQuery(base: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  return qs.toString() ? `${base}?${qs.toString()}` : base;
}

export interface ListCompressTemplatesParams {
  /** Filter by custom model ID, or a base model name to list all derived custom models. */
  model?: string;
  /** Response language: `zh-CN` | `en-US`. */
  lang?: string;
  signal?: AbortSignal;
}

/** GET /api/v1/fine-tunes/compress/templates */
export async function listCompressTemplates(
  client: Client,
  params: ListCompressTemplatesParams = {},
): Promise<ListCompressTemplatesResponse> {
  return client.requestJson<ListCompressTemplatesResponse>({
    path: withQuery(finetuneCompressTemplatesPath(), { model: params.model, lang: params.lang }),
    method: "GET",
    signal: params.signal,
  });
}

/** POST /api/v1/fine-tunes/compress/jobs */
export async function createCompressJob(
  client: Client,
  body: CreateCompressJobRequest,
  signal?: AbortSignal,
): Promise<CompressJobResponse> {
  return client.requestJson<CompressJobResponse>({
    path: finetuneCompressJobsPath(),
    method: "POST",
    body,
    signal,
  });
}

export interface ListCompressJobsParams {
  status?: string;
  model?: string;
  templateId?: string;
  quantSpec?: string;
  quantMethod?: string;
  startTime?: string;
  endTime?: string;
  searchKey?: string;
  /** `job_id` | `job_name`; narrows `searchKey` to one field. */
  selectKey?: string;
  sortOrder?: string;
  pageNo?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

/** GET /api/v1/fine-tunes/compress/jobs */
export async function listCompressJobs(
  client: Client,
  params: ListCompressJobsParams = {},
): Promise<ListCompressJobsResponse> {
  const path = withQuery(finetuneCompressJobsPath(), {
    status: params.status,
    model: params.model,
    template_id: params.templateId,
    quant_spec: params.quantSpec,
    quant_method: params.quantMethod,
    start_time: params.startTime,
    end_time: params.endTime,
    search_key: params.searchKey,
    select_key: params.selectKey,
    sort_order: params.sortOrder,
    page_no: params.pageNo,
    page_size: params.pageSize,
  });
  return client.requestJson<ListCompressJobsResponse>({
    path,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/fine-tunes/compress/jobs/{job_id} */
export async function getCompressJob(
  client: Client,
  jobId: string,
  signal?: AbortSignal,
): Promise<CompressJobResponse> {
  return client.requestJson<CompressJobResponse>({
    path: finetuneCompressJobPath(jobId),
    method: "GET",
    signal,
  });
}

export interface GetCompressJobLogsParams {
  /** Skip the first N lines. */
  offset?: number;
  /** Number of lines to read (server cap: 1000). */
  line?: number;
  signal?: AbortSignal;
}

/** GET /api/v1/fine-tunes/compress/jobs/{job_id}/logs */
export async function getCompressJobLogs(
  client: Client,
  jobId: string,
  params: GetCompressJobLogsParams = {},
): Promise<GetCompressJobLogsResponse> {
  return client.requestJson<GetCompressJobLogsResponse>({
    path: withQuery(finetuneCompressLogsPath(jobId), {
      offset: params.offset,
      line: params.line,
    }),
    method: "GET",
    signal: params.signal,
  });
}

/** POST /api/v1/fine-tunes/compress/jobs/{job_id}/cancel */
export async function cancelCompressJob(
  client: Client,
  jobId: string,
  signal?: AbortSignal,
): Promise<CompressJobActionResponse> {
  return client.requestJson<CompressJobActionResponse>({
    path: finetuneCompressCancelPath(jobId),
    method: "POST",
    signal,
  });
}

/** DELETE /api/v1/fine-tunes/compress/jobs/{job_id} */
export async function deleteCompressJob(
  client: Client,
  jobId: string,
  signal?: AbortSignal,
): Promise<CompressJobActionResponse> {
  return client.requestJson<CompressJobActionResponse>({
    path: finetuneCompressJobPath(jobId),
    method: "DELETE",
    signal,
  });
}
