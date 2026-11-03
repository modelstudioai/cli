/**
 * Custom model import HTTP API wrappers.
 *
 * Thin functions over `requestJson` for DashScope
 * `/api/v1/custom_models/import`. Server errors are surfaced verbatim by the
 * shared HTTP error layer — these wrappers never translate them.
 */
import { customModelImportEndpoint, customModelImportJobEndpoint } from "../client/endpoints.ts";
import type { Client } from "../client/client.ts";
import type {
  CreateCustomModelImportRequest,
  CreateCustomModelImportResponse,
  DeleteCustomModelImportResponse,
  GetCustomModelImportResponse,
  ListCustomModelImportsResponse,
} from "./types.ts";

/** POST /api/v1/custom_models/import */
export async function createCustomModelImport(
  client: Client,
  body: CreateCustomModelImportRequest,
  signal?: AbortSignal,
): Promise<CreateCustomModelImportResponse> {
  return client.requestJson<CreateCustomModelImportResponse>({
    path: customModelImportEndpoint(),
    method: "POST",
    body,
    signal,
  });
}

export interface ListCustomModelImportsParams {
  pageNo?: number;
  pageSize?: number;
  status?: string;
  /** Exact match against the server-generated `model_name`. */
  modelName?: string;
  signal?: AbortSignal;
}

/** GET /api/v1/custom_models/import */
export async function listCustomModelImports(
  client: Client,
  params: ListCustomModelImportsParams = {},
): Promise<ListCustomModelImportsResponse> {
  const query = new URLSearchParams();
  if (params.pageNo !== undefined) query.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) query.set("page_size", String(params.pageSize));
  if (params.status) query.set("status", params.status);
  if (params.modelName) query.set("model_name", params.modelName);
  const basePath = customModelImportEndpoint();
  const path = query.toString() ? `${basePath}?${query.toString()}` : basePath;
  return client.requestJson<ListCustomModelImportsResponse>({
    path,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/custom_models/import/{job_id} */
export async function getCustomModelImport(
  client: Client,
  jobId: string,
  signal?: AbortSignal,
): Promise<GetCustomModelImportResponse> {
  return client.requestJson<GetCustomModelImportResponse>({
    path: customModelImportJobEndpoint(jobId),
    method: "GET",
    signal,
  });
}

/** DELETE /api/v1/custom_models/import/{job_id} */
export async function deleteCustomModelImport(
  client: Client,
  jobId: string,
  signal?: AbortSignal,
): Promise<DeleteCustomModelImportResponse> {
  return client.requestJson<DeleteCustomModelImportResponse>({
    path: customModelImportJobEndpoint(jobId),
    method: "DELETE",
    signal,
  });
}
