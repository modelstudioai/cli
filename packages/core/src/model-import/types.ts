/**
 * Custom model import API types.
 *
 * Maps DashScope `/api/v1/custom_models/import` request/response shapes
 * (snake_case preserved verbatim — callers decide how to surface fields).
 */

/** OSS storage location of the model files to import. */
export interface CustomModelImportStorageInfo {
  bucket_name: string;
  /** Directory prefix; must end with `/` and cannot be the bucket root. */
  object_key: string;
}

/** POST /api/v1/custom_models/import request body. */
export interface CreateCustomModelImportRequest {
  /** Base model ID (e.g. `qwen3-32b`). */
  model_name: string;
  /** Display name; server defaults to the base model name when omitted. */
  display_name?: string;
  /** Import source. Only `oss` is currently supported. */
  source: string;
  /** `lora` (LoRA-tuned) or `full` (fully-tuned). */
  weight_type: string;
  storage_info: CustomModelImportStorageInfo;
}

/** A custom model import job as returned by the platform. */
export interface CustomModelImportJob {
  job_id?: string;
  /** Server-generated model identifier (base model name + timestamp suffix). */
  model_name?: string;
  display_name?: string;
  /** Uppercase `OSS` in responses. */
  source?: string;
  /** Present on create; omitted by get/list. */
  weight_type?: string;
  storage_info?: CustomModelImportStorageInfo;
  /** PENDING | RUNNING | SUCCESSED | FAILED (server values verbatim). */
  status?: string;
  /** Present when status is FAILED; server-provided reason text. */
  error_code?: string;
  gmt_create?: string;
  [key: string]: unknown;
}

export interface CreateCustomModelImportResponse {
  request_id?: string;
  output?: CustomModelImportJob;
  data?: CustomModelImportJob;
}

export interface GetCustomModelImportResponse {
  request_id?: string;
  output?: CustomModelImportJob;
  data?: CustomModelImportJob;
}

export interface DeleteCustomModelImportResponse {
  request_id?: string;
  output?: CustomModelImportJob;
  data?: CustomModelImportJob;
}

export interface ListCustomModelImportsResponse {
  request_id?: string;
  output?: {
    total?: number;
    page_no?: number;
    page_size?: number;
    list?: CustomModelImportJob[];
    [key: string]: unknown;
  };
  data?: {
    total?: number;
    page_no?: number;
    page_size?: number;
    list?: CustomModelImportJob[];
    [key: string]: unknown;
  };
}

/** Entry returned by the console `listSupportImportModels` catalog API. */
export interface SupportImportModel {
  /** Display name (e.g. `Qwen3-32B`); may be absent. */
  name?: string;
  /** Model ID used to match `--base-model` (e.g. `qwen3-32b`). */
  model?: string;
  /** Training methods supported for import (e.g. `sft`, `efficient_sft`). */
  supportTrainTypes?: string[];
  postProcessCapabilities?: {
    quantizationSupported?: boolean;
    mtpSupported?: boolean;
    quantizationStrategyCodes?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Parsed `listSupportImportModels` catalog result. */
export interface SupportImportModelsResult {
  total?: number;
  pageNo?: number;
  pageSize?: number;
  list: SupportImportModel[];
}
