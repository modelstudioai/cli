/**
 * Model deployment HTTP API wrappers.
 *
 * Thin functions over `requestJson`. They return the parsed body verbatim
 * (snake_case) so callers can decide how to surface fields.
 */
import { requestJson } from "../client/http.ts";
import {
  deploymentsEndpoint,
  deploymentEndpoint,
  deploymentScaleEndpoint,
  deploymentUpdateEndpoint,
  deploymentsModelsEndpoint,
} from "../client/endpoints.ts";
import type { Config } from "../config/schema.ts";
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
  config: Config,
  body: CreateDeploymentRequest,
  signal?: AbortSignal,
): Promise<CreateDeploymentResponse> {
  const url = deploymentsEndpoint(config.baseUrl);
  return requestJson<CreateDeploymentResponse>(config, {
    url,
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
  config: Config,
  params: ListDeploymentsParams = {},
): Promise<ListDeploymentsResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  if (params.status) qs.set("status", params.status);
  const base = deploymentsEndpoint(config.baseUrl);
  const url = qs.toString() ? `${base}?${qs.toString()}` : base;
  return requestJson<ListDeploymentsResponse>(config, {
    url,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/deployments/{deployed_model} */
export async function getDeployment(
  config: Config,
  deployedModel: string,
  signal?: AbortSignal,
): Promise<GetDeploymentResponse> {
  const url = deploymentEndpoint(config.baseUrl, deployedModel);
  return requestJson<GetDeploymentResponse>(config, {
    url,
    method: "GET",
    signal,
  });
}

/** DELETE /api/v1/deployments/{deployed_model} */
export async function deleteDeployment(
  config: Config,
  deployedModel: string,
  signal?: AbortSignal,
): Promise<DeleteDeploymentResponse> {
  const url = deploymentEndpoint(config.baseUrl, deployedModel);
  return requestJson<DeleteDeploymentResponse>(config, {
    url,
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
  config: Config,
  params: ListDeployableModelsParams = {},
): Promise<ListDeployableModelsResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  if (params.version) qs.set("version", params.version);
  if (params.modelSource) qs.set("model_source", params.modelSource);
  const base = deploymentsModelsEndpoint(config.baseUrl);
  const url = qs.toString() ? `${base}?${qs.toString()}` : base;
  return requestJson<ListDeployableModelsResponse>(config, {
    url,
    method: "GET",
    signal: params.signal,
  });
}

/** PUT /api/v1/deployments/{deployed_model}/scale */
export async function scaleDeployment(
  config: Config,
  deployedModel: string,
  body: ScaleDeploymentRequest,
  signal?: AbortSignal,
): Promise<ScaleDeploymentResponse> {
  const url = deploymentScaleEndpoint(config.baseUrl, deployedModel);
  return requestJson<ScaleDeploymentResponse>(config, {
    url,
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
  config: Config,
  deployedModel: string,
  body: UpdateDeploymentRequest,
  signal?: AbortSignal,
): Promise<UpdateDeploymentResponse> {
  const url = deploymentUpdateEndpoint(config.baseUrl, deployedModel);
  return requestJson<UpdateDeploymentResponse>(config, {
    url,
    method: "PUT",
    body,
    signal,
  });
}
