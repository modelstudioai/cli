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
