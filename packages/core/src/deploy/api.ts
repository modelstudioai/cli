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
  deploymentCapacityInstancesPath,
  deploymentCapacityInstancePath,
  deploymentCapacityOperationPath,
  deploymentCapacityInstanceScalePath,
  deploymentCapacityInstanceRenewPath,
  deploymentOverflowPath,
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
  ListCapacityInstancesResponse,
  GetCapacityInstanceResponse,
  GetCapacityOperationResponse,
  CreateCapacityInstanceRequest,
  ScaleCapacityInstanceRequest,
  RenewCapacityInstanceRequest,
  CapacityOperationResponse,
  UpdateDeploymentOverflowResponse,
} from "./types.ts";

/** Caller-owned idempotency key; wrappers never generate keys or retry writes. */
export interface CapacityWriteOptions {
  requestId?: string;
  signal?: AbortSignal;
}

function capacityWriteHeaders(requestId?: string): Record<string, string> | undefined {
  return requestId
    ? { "x-acs-req-uuid": requestId, "X-DashScope-RequestId": requestId }
    : undefined;
}

/** POST /api/v1/deployments; initial ModelCode creation has no instance-idempotency guarantee. */
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
  plan?: string;
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
  if (params.plan !== undefined) qs.set("plan", params.plan);
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

export interface ListCapacityInstancesParams {
  pageNo?: number;
  pageSize?: number;
  includeDeleted?: boolean;
  statuses?: string[];
  chargeTypes?: string[];
  signal?: AbortSignal;
}

/** GET /api/v1/deployments/{deployed_model}/capacity-instances */
export async function listCapacityInstances(
  client: Client,
  code: string,
  params: ListCapacityInstancesParams = {},
): Promise<ListCapacityInstancesResponse> {
  const query = new URLSearchParams();
  if (params.pageNo !== undefined) query.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) query.set("page_size", String(params.pageSize));
  if (params.includeDeleted !== undefined) {
    query.set("include_deleted", String(params.includeDeleted));
  }
  if (params.statuses !== undefined) query.set("statuses", params.statuses.join(","));
  if (params.chargeTypes !== undefined) query.set("charge_types", params.chargeTypes.join(","));
  const base = deploymentCapacityInstancesPath(code);
  const path = query.toString() ? `${base}?${query.toString()}` : base;
  return client.requestJson<ListCapacityInstancesResponse>({
    path,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/deployments/{deployed_model}/capacity-instances/{instance_id} */
export async function getCapacityInstance(
  client: Client,
  code: string,
  id: string,
  signal?: AbortSignal,
): Promise<GetCapacityInstanceResponse> {
  return client.requestJson<GetCapacityInstanceResponse>({
    path: deploymentCapacityInstancePath(code, id),
    method: "GET",
    signal,
  });
}

/** GET /api/v1/deployments/{deployed_model}/capacity-operations/{operation_id} */
export async function getCapacityOperation(
  client: Client,
  code: string,
  id: string,
  signal?: AbortSignal,
): Promise<GetCapacityOperationResponse> {
  return client.requestJson<GetCapacityOperationResponse>({
    path: deploymentCapacityOperationPath(code, id),
    method: "GET",
    signal,
  });
}

/**
 * POST /api/v1/deployments/{deployed_model}/capacity-instances
 * All instance writes return operations verbatim; callers must check operation_status, even on HTTP 200.
 */
export async function createCapacityInstance(
  client: Client,
  code: string,
  body: CreateCapacityInstanceRequest,
  options: CapacityWriteOptions = {},
): Promise<CapacityOperationResponse> {
  return client.requestJson<CapacityOperationResponse>({
    path: deploymentCapacityInstancesPath(code),
    method: "POST",
    body,
    headers: capacityWriteHeaders(options.requestId),
    signal: options.signal,
  });
}

/** PUT /api/v1/deployments/{deployed_model}/capacity-instances/{instance_id}/scale */
export async function scaleCapacityInstance(
  client: Client,
  code: string,
  id: string,
  body: ScaleCapacityInstanceRequest,
  options: CapacityWriteOptions = {},
): Promise<CapacityOperationResponse> {
  return client.requestJson<CapacityOperationResponse>({
    path: deploymentCapacityInstanceScalePath(code, id),
    method: "PUT",
    body,
    headers: capacityWriteHeaders(options.requestId),
    signal: options.signal,
  });
}

/** PUT /api/v1/deployments/{deployed_model}/capacity-instances/{instance_id}/renew */
export async function renewCapacityInstance(
  client: Client,
  code: string,
  id: string,
  body: RenewCapacityInstanceRequest,
  options: CapacityWriteOptions = {},
): Promise<CapacityOperationResponse> {
  return client.requestJson<CapacityOperationResponse>({
    path: deploymentCapacityInstanceRenewPath(code, id),
    method: "PUT",
    body,
    headers: capacityWriteHeaders(options.requestId),
    signal: options.signal,
  });
}

/** DELETE /api/v1/deployments/{deployed_model}/capacity-instances/{instance_id}; no JSON body. */
export async function deleteCapacityInstance(
  client: Client,
  code: string,
  id: string,
  options: CapacityWriteOptions & { reason?: string } = {},
): Promise<CapacityOperationResponse> {
  const base = deploymentCapacityInstancePath(code, id);
  const query = new URLSearchParams();
  if (options.reason !== undefined) query.set("reason", options.reason);
  return client.requestJson<CapacityOperationResponse>({
    path: query.toString() ? `${base}?${query.toString()}` : base,
    method: "DELETE",
    headers: capacityWriteHeaders(options.requestId),
    signal: options.signal,
  });
}

/** PUT /api/v1/deployments/{deployed_model}/update-overflowstrategy */
export async function updateDeploymentOverflow(
  client: Client,
  code: string,
  strategy: "enable" | "disable",
  signal?: AbortSignal,
): Promise<UpdateDeploymentOverflowResponse> {
  return client.requestJson<UpdateDeploymentOverflowResponse>({
    path: deploymentOverflowPath(code),
    method: "PUT",
    body: { overflow_strategy: strategy },
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
  requestId?: string,
): Promise<ScaleDeploymentResponse> {
  return client.requestJson<ScaleDeploymentResponse>({
    path: deploymentScalePath(deployedModel),
    method: "PUT",
    body,
    headers: capacityWriteHeaders(requestId),
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
