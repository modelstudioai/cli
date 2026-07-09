/**
 * Model deployment HTTP API wrappers.
 *
 * Thin functions over `requestJson`. They return the parsed body verbatim
 * (snake_case) so callers can decide how to surface fields.
 */
import {
  deploymentsPath,
  deploymentPath,
  deploymentScalePath,
  deploymentUpdatePath,
  deploymentsModelsPath,
} from "../client/endpoints.ts";
import type { Client } from "../client/client.ts";
import type {
  CreateDeploymentRequest,
  CreateDeploymentResponse,
  ListDeploymentsResponse,
  GetDeploymentResponse,
  DeleteDeploymentResponse,
  ListDeployableModelsResponse,
  ScaleDeploymentRequest,
  ScaleDeploymentResponse,
  UpdateDeploymentRequest,
  UpdateDeploymentResponse,
} from "./types.ts";

/** POST /api/v1/deployments */
export async function createDeployment(
  client: Client,
  body: CreateDeploymentRequest,
  signal?: AbortSignal,
): Promise<CreateDeploymentResponse> {
  return client.requestJson<CreateDeploymentResponse>({
    path: deploymentsPath(),
    method: "POST",
    body,
    signal,
  });
}

export interface ListDeploymentsParams {
  pageNo?: number;
  pageSize?: number;
  status?: string;
  signal?: AbortSignal;
}

/** GET /api/v1/deployments */
export async function listDeployments(
  client: Client,
  params: ListDeploymentsParams = {},
): Promise<ListDeploymentsResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  if (params.status) qs.set("status", params.status);
  const base = deploymentsPath();
  const path = qs.toString() ? `${base}?${qs.toString()}` : base;
  return client.requestJson<ListDeploymentsResponse>({
    path,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/deployments/{deployed_model} */
export async function getDeployment(
  client: Client,
  deployedModel: string,
  signal?: AbortSignal,
): Promise<GetDeploymentResponse> {
  return client.requestJson<GetDeploymentResponse>({
    path: deploymentPath(deployedModel),
    method: "GET",
    signal,
  });
}

/** DELETE /api/v1/deployments/{deployed_model} */
export async function deleteDeployment(
  client: Client,
  deployedModel: string,
  signal?: AbortSignal,
): Promise<DeleteDeploymentResponse> {
  return client.requestJson<DeleteDeploymentResponse>({
    path: deploymentPath(deployedModel),
    method: "DELETE",
    signal,
  });
}

export interface ListDeployableModelsParams {
  pageNo?: number;
  pageSize?: number;
  /** Catalog version filter, e.g. "v1.0". */
  version?: string;
  /** Source filter: "custom" (fine-tuned outputs) | "public" | …. */
  modelSource?: string;
  signal?: AbortSignal;
}

/** GET /api/v1/deployments/models */
export async function listDeployableModels(
  client: Client,
  params: ListDeployableModelsParams = {},
): Promise<ListDeployableModelsResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  if (params.version) qs.set("version", params.version);
  if (params.modelSource) qs.set("model_source", params.modelSource);
  const base = deploymentsModelsPath();
  const path = qs.toString() ? `${base}?${qs.toString()}` : base;
  return client.requestJson<ListDeployableModelsResponse>({
    path,
    method: "GET",
    signal: params.signal,
  });
}

/** PUT /api/v1/deployments/{deployed_model}/scale */
export async function scaleDeployment(
  client: Client,
  deployedModel: string,
  body: ScaleDeploymentRequest,
  signal?: AbortSignal,
): Promise<ScaleDeploymentResponse> {
  return client.requestJson<ScaleDeploymentResponse>({
    path: deploymentScalePath(deployedModel),
    method: "PUT",
    body,
    signal,
  });
}

/**
 * PUT /api/v1/deployments/{deployed_model}/update
 *
 * Update rate limits. At least one of `rpm_limit` / `tpm_limit` must be set.
 */
export async function updateDeployment(
  client: Client,
  deployedModel: string,
  body: UpdateDeploymentRequest,
  signal?: AbortSignal,
): Promise<UpdateDeploymentResponse> {
  return client.requestJson<UpdateDeploymentResponse>({
    path: deploymentUpdatePath(deployedModel),
    method: "PUT",
    body,
    signal,
  });
}
