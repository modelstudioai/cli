/**
 * Fine-tune job API types.
 *
 * Maps DashScope `/api/v1/fine-tunes` request/response shapes (snake_case
 * preserved verbatim — callers decide how to surface fields).
 */

/** Hyper-parameters honored by text/thinking/vision SFT models. */
export interface FineTuneHyperParameters {
  /** Number of training epochs. */
  n_epochs?: number;
  batch_size?: number;
  /** Sent as a string to avoid JSON-number precision loss (e.g. "1.6e-5"). */
  learning_rate?: string;
  max_length?: number;
  /** Train/validation split ratio when no validation file is provided. */
  split?: number;
  lr_scheduler_type?: string;
  /** Future-compat: arbitrary additional fields are forwarded as-is. */
  [k: string]: unknown;
}

/** POST /api/v1/fine-tunes request body. */
export interface CreateFineTuneRequest {
  /** Base model ID, or a previously fine-tuned model ID for continued training. */
  model: string;
  training_file_ids: string[];
  /**
   * Server-supported values: `cpt | sft | efficient_sft | dpo_full | dpo_lora`.
   *
   * NOTE — current bailian-cli scope: `sft` (default) and `efficient_sft`.
   * Other values are rejected by the CLI at parse time so users get an
   * immediate error instead of a vague server-side rejection. This type
   * stays open as `string` for forward compatibility (so adding `dpo_lora`
   * later is a CLI-only change).
   */
  training_type: string;
  validation_file_ids?: string[];
  hyper_parameters?: FineTuneHyperParameters;
  /** Display name for the job (optional, server generates if omitted). */
  job_name?: string;
  /** Requested scheduling priority; the service determines the effective priority. */
  priority?: string;
  /** Output model name. Either bring your own or let the server generate one. */
  model_name?: string;
  /** Suffix appended by the platform; field is `finetuned_output_suffix` (NOT `suffix`). */
  finetuned_output_suffix?: string;
}

/** GET /api/v1/fine-tunes/{id}/logs response. */
export interface FineTuneLogEntry {
  /** Server-defined log line — schema varies; preserve as-is. */
  [k: string]: unknown;
}

export interface GetFineTuneLogsResponse {
  request_id?: string;
  output?: {
    logs?: Array<FineTuneLogEntry | string>;
    total?: number;
    page_no?: number;
    page_size?: number;
    [k: string]: unknown;
  };
  data?: {
    logs?: Array<FineTuneLogEntry | string>;
    total?: number;
    page_no?: number;
    page_size?: number;
    [k: string]: unknown;
  };
}

/** A single checkpoint as returned by the platform. */
export interface FineTuneCheckpoint {
  checkpoint?: string;
  checkpoint_id?: string;
  full_name?: string;
  job_id?: string;
  model_name?: string;
  model_display_name?: string;
  /** SUCCEEDED | PENDING | FAILED | … */
  status?: string;
  step?: number;
  epoch?: number;
  create_time?: string;
  expire_time?: string;
  output_model_deleted?: boolean;
  metrics?: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * GET /api/v1/fine-tunes/{job_id}/checkpoints response.
 *
 * Real shape: `output` is an array of checkpoints directly (NOT wrapped in
 * `{ checkpoints: [...] }`). The wrapped form is preserved as a fallback for
 * older deployments.
 */
export interface ListCheckpointsResponse {
  request_id?: string;
  output?:
    | FineTuneCheckpoint[]
    | {
        checkpoints?: FineTuneCheckpoint[];
        total?: number;
        [k: string]: unknown;
      };
  data?:
    | FineTuneCheckpoint[]
    | {
        checkpoints?: FineTuneCheckpoint[];
        total?: number;
        [k: string]: unknown;
      };
}

/** GET /api/v1/fine-tunes/{job_id}/export/{checkpoint}?model_name= response. */
export interface ExportCheckpointResponse {
  request_id?: string;
  output?: {
    /** Resulting deployable model name. */
    model_name?: string;
    [k: string]: unknown;
  };
  data?: {
    model_name?: string;
    [k: string]: unknown;
  };
}

/** POST /api/v1/fine-tunes/{id}/cancel response. */
export interface CancelFineTuneResponse {
  request_id?: string;
  output?: FineTuneJob;
  data?: FineTuneJob;
}

/** DELETE /api/v1/fine-tunes/{id} response. */
export interface DeleteFineTuneResponse {
  request_id?: string;
  output?: { deleted?: boolean; job_id?: string; [k: string]: unknown };
  data?: { deleted?: boolean; job_id?: string; [k: string]: unknown };
}

/** A single fine-tune job record as returned by the platform. */
export interface FineTuneJob {
  job_id?: string;
  job_name?: string;
  model?: string;
  base_model?: string;
  training_type?: string;
  /** PENDING | RUNNING | SUCCEEDED | FAILED | CANCELED */
  status?: string;
  finetuned_output?: string;
  finetuned_output_suffix?: string;
  model_name?: string;
  training_file_ids?: string[];
  validation_file_ids?: string[];
  hyper_parameters?: FineTuneHyperParameters;
  /** Server-side timestamps (DashScope uses snake_case `create_time` / `end_time`). */
  create_time?: string;
  end_time?: string;
  /** Legacy field names — kept for backward compatibility with older deployments. */
  gmt_create?: string;
  gmt_modified?: string;
  /** Free-form additional fields are preserved by callers. */
  [k: string]: unknown;
}

/** POST /api/v1/fine-tunes response. */
export interface CreateFineTuneResponse {
  request_id?: string;
  /** Modern DashScope shape. */
  output?: FineTuneJob;
  /** Legacy shape for older platform builds. */
  data?: FineTuneJob;
}

/** GET /api/v1/fine-tunes response. */
export interface ListFineTunesResponse {
  request_id?: string;
  output?: {
    jobs?: FineTuneJob[];
    total?: number;
    page_no?: number;
    page_size?: number;
  };
  data?: {
    jobs?: FineTuneJob[];
    total?: number;
    page_no?: number;
    page_size?: number;
  };
}

/** GET /api/v1/fine-tunes/{job_id} response. */
export interface GetFineTuneResponse {
  request_id?: string;
  output?: FineTuneJob;
  data?: FineTuneJob;
}

// ---- Model Compression (DashScope /api/v1/fine-tunes/compress) ----

/** A tunable hyper-parameter declared by a compression template. */
export interface CompressHyperParameter {
  name?: string;
  /** `number` (data_range / step) or `string` (support_values). */
  type?: string;
  display_name?: string;
  description?: string;
  defaultValue?: string;
  recommend_value?: string;
  required?: boolean;
  support_values?: string[];
  data_range?: string[];
  step?: number;
  [k: string]: unknown;
}

/** A compression template bound to a quantizable model. */
export interface CompressTemplate {
  template_id?: string;
  template_name?: string;
  description?: string;
  /** Currently always `quantization`. */
  compress_type?: string;
  hyper_parameters?: CompressHyperParameter[];
  [k: string]: unknown;
}

/** A quantizable custom model and the templates it supports. */
export interface CompressModel {
  model?: string;
  model_name?: string;
  base_model?: string;
  templates?: CompressTemplate[];
  [k: string]: unknown;
}

/** GET /api/v1/fine-tunes/compress/templates response. */
export interface ListCompressTemplatesResponse {
  request_id?: string;
  output?: {
    base_models?: string[];
    custom_models?: CompressModel[];
    [k: string]: unknown;
  };
}

/** POST /api/v1/fine-tunes/compress/jobs request body. */
export interface CreateCompressJobRequest {
  /** Source custom (full-parameter fine-tuned) model ID. */
  model: string;
  template_id: string;
  job_name?: string;
  job_description?: string;
  /** Key-value overrides; only the keys to override. */
  hyper_parameters?: Record<string, unknown>;
  /** Calibration dataset file IDs; only effective when `calib_input=true`. */
  custom_calibration_file_ids?: string[];
  /** Output model name suffix (≤ 8 chars, lowercase letters and digits). */
  output_model_suffix?: string;
}

/** A compression job record as returned by the platform. */
export interface CompressJob {
  job_id?: string;
  job_name?: string;
  job_description?: string;
  /** PENDING | QUEUING | RUNNING | CANCELING | SUCCEEDED | FAILED | CANCELED */
  status?: string;
  model?: string;
  base_model?: string;
  template_id?: string;
  template_name?: string;
  template_description?: string;
  training_type?: string;
  compress_type?: string;
  hyper_parameters?: Record<string, unknown>;
  custom_calibration_file_ids?: string[];
  /** Quantized output model ID (only set on SUCCEEDED). */
  quantized_output?: string | null;
  create_time?: string;
  start_time?: string | null;
  end_time?: string | null;
  error?: { code?: string; message?: string; [k: string]: unknown } | null;
  group?: string;
  /** GPU seconds; present on SUCCEEDED / CANCELED. */
  usage?: number;
  [k: string]: unknown;
}

/** POST /api/v1/fine-tunes/compress/jobs and GET /jobs/{job_id} response. */
export interface CompressJobResponse {
  request_id?: string;
  output?: CompressJob;
}

/** GET /api/v1/fine-tunes/compress/jobs response. */
export interface ListCompressJobsResponse {
  request_id?: string;
  output?: {
    total?: number;
    page_no?: number;
    page_size?: number;
    jobs?: CompressJob[];
    [k: string]: unknown;
  };
}

/** GET /api/v1/fine-tunes/compress/jobs/{job_id}/logs response. */
export interface GetCompressJobLogsResponse {
  request_id?: string;
  output?: {
    total?: number;
    logs?: string[];
    [k: string]: unknown;
  };
}

/** POST /jobs/{job_id}/cancel and DELETE /jobs/{job_id} response. */
export interface CompressJobActionResponse {
  request_id?: string;
  output?: { status?: string; [k: string]: unknown };
}
