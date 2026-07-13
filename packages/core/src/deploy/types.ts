/**
 * Model-deployment API types.
 *
 * Maps DashScope `/api/v1/deployments` request/response shapes (snake_case
 * preserved verbatim — callers decide how to surface fields).
 */

/** A single deployment record as returned by the platform. */
export interface Deployment {
  /** Unique deployed-model identifier — used as the `model` parameter when invoking the deployed model. */
  deployed_model?: string;
  /** Human-friendly display name set at creation time. */
  name?: string;
  /** Underlying model identifier (e.g. fine-tuned output or catalog model). */
  model_name?: string;
  /** Catalog base model. */
  base_model?: string;
  /** PENDING | RUNNING | STOPPED | FAILED */
  status?: string;
  /** Billing plan: mu | cu | ptu | lora (Token-billed). */
  plan?: string;
  /** Spec descriptor for MU plan, e.g. "MU1". */
  model_unit_spec?: string;
  /** Charge type, e.g. "post_paid". */
  charge_type?: string;
  /** Capacity in plan units. */
  capacity?: number;
  base_capacity?: number;
  ready_capacity?: number;
  /** Rate limits (per minute). */
  rpm_limit?: number;
  tpm_limit?: number;
  /** PTU-only token-rate limits. */
  input_tpm?: number;
  output_tpm?: number;
  enable_thinking?: boolean;
  max_context_length?: number;
  workspace_id?: string;
  creator?: string;
  modifier?: string;
  gmt_create?: string;
  gmt_modified?: string;
  /** Free-form additional fields are preserved by callers. */
  [k: string]: unknown;
}

/** A single deployable model record (GET /deployments/models). */
export interface DeployableModel {
  model_name?: string;
  base_model?: string;
  /** custom | public | base | … */
  model_source?: string;
  /** Supported plans for `custom` (fine-tuned) models, e.g. ["mu","lora"]. */
  supported_plans?: string[];
  /**
   * Nested plan info for `base` (catalog) models. Each entry describes one
   * plan and (when applicable) its deployment templates.
   *   - plan: "mu" | "ptu_v2" | "cu" | …
   *   - templates: required when plan="mu" — picks deploy_spec / charge_type / role configs
   *   - cu_specs: required when plan="cu" — light/basic etc
   */
  plans?: Array<{
    plan?: string;
    templates?: Array<DeployableTemplate>;
    cu_specs?: string[];
    [k: string]: unknown;
  }>;
  display_name?: string;
  description?: string;
  version?: string;
  status?: string;
  gmt_create?: string;
  gmt_modified?: string;
  [k: string]: unknown;
}

/** A single deployment template (only used by `plan=mu` base models). */
export interface DeployableTemplate {
  template_id?: string;
  template_name?: string;
  template_desc?: string;
  /** pre_paid | post_paid */
  charge_type?: string;
  /** SYSTEM | CUSTOM */
  template_source?: string;
  /** COUPLED | SEPERATED */
  template_type?: string;
  template_version?: string;
  deploy_spec?: string;
  /** Role-specific resource specs. Either `unified` (COUPLED) or `prefill` + `decode` (SEPERATED). */
  roles?: {
    unified?: {
      model_unit_spec?: string;
      capacity_unit_per_instance?: number;
      capacity_unit_init?: number;
    };
    prefill?: {
      model_unit_spec?: string;
      capacity_unit_per_instance?: number;
      capacity_unit_init?: number;
    };
    decode?: {
      model_unit_spec?: string;
      capacity_unit_per_instance?: number;
      capacity_unit_init?: number;
    };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/** POST /api/v1/deployments request body. */
export interface CreateDeploymentRequest {
  /** Required. The catalog or fine-tuned model identifier. */
  model_name: string;
  /** Required. Display name shown in the console. */
  name: string;
  /** Required. Billing plan: mu | cu | ptu | lora. CLI defaults to "lora". */
  plan: string;
  /** Required by API even for token-billed (lora) plans where it is ignored — CLI injects 1. */
  capacity?: number;
  /** Deploy spec id (e.g. "MU1", "dps-..."), sent as `deploy_spec` in POST body. */
  deploy_spec?: string;
  /**
   * PTU capacity (provisioned throughput limits). Only effective when
   * `plan === "ptu"`. The doc says this defaults to 10000/1000 when omitted,
   * but the platform currently rejects creation without it ("Miss ptu capacity
   * info"), so the CLI treats it as required for ptu.
   */
  ptu_capacity?: PtuCapacity;
  /**
   * AIGC generation config for fine-tuned Wan video (i2v/kf2v) LoRA deployments.
   * Ignored by non-video plans. See `AigcConfig`.
   */
  aigc_config?: AigcConfig;
  /** Future-compat: arbitrary additional fields are forwarded as-is. */
  [k: string]: unknown;
}

/**
 * AIGC generation config — used when deploying fine-tuned Wan video (i2v/kf2v)
 * LoRA models. Controls how prompts are applied at inference time:
 *   - use_input_prompt=false: ignore the caller's prompt, use the preset
 *     `prompt` template instead (the common LoRA case).
 *   - use_input_prompt=true: honor the caller's prompt.
 * `lora_prompt_default` is the default trigger-word phrase appended for the LoRA.
 */
export interface AigcConfig {
  use_input_prompt?: boolean;
  prompt?: string;
  lora_prompt_default?: string;
}

/** PTU throughput limits — only used when `plan === "ptu"`. */
export interface PtuCapacity {
  /** Max input tokens per minute (all models). */
  input_tpm?: number;
  /** Max output tokens per minute (all models). */
  output_tpm?: number;
  /** Max thinking-output tokens per minute (some models only). */
  thinking_output_tpm?: number;
}

/** POST /api/v1/deployments response. */
export interface CreateDeploymentResponse {
  request_id?: string;
  output?: Deployment;
  data?: Deployment;
}

/** GET /api/v1/deployments response. */
export interface ListDeploymentsResponse {
  request_id?: string;
  output?: {
    deployments?: Deployment[];
    total?: number;
    page_no?: number;
    page_size?: number;
    [k: string]: unknown;
  };
  data?: {
    deployments?: Deployment[];
    total?: number;
    page_no?: number;
    page_size?: number;
    [k: string]: unknown;
  };
}

/** GET /api/v1/deployments/{deployed_model} response. */
export interface GetDeploymentResponse {
  request_id?: string;
  output?: Deployment;
  data?: Deployment;
}

/** DELETE /api/v1/deployments/{deployed_model} response. */
export interface DeleteDeploymentResponse {
  request_id?: string;
  output?: { deleted?: boolean; deployed_model?: string; [k: string]: unknown };
  data?: { deleted?: boolean; deployed_model?: string; [k: string]: unknown };
}

/** GET /api/v1/deployments/models response. */
export interface ListDeployableModelsResponse {
  request_id?: string;
  output?: {
    models?: DeployableModel[];
    total?: number;
    page_no?: number;
    page_size?: number;
    [k: string]: unknown;
  };
  data?: {
    models?: DeployableModel[];
    total?: number;
    page_no?: number;
    page_size?: number;
    [k: string]: unknown;
  };
}

/** PUT /api/v1/deployments/{deployed_model}/scale request body. */
export interface ScaleDeploymentRequest {
  /** New capacity in plan units. Server-side constraint: integer multiple of `base_capacity`, < 1000. */
  capacity?: number;
  /** PTU-only token-rate adjustments. */
  input_tpm?: number;
  output_tpm?: number;
  [k: string]: unknown;
}

/** PUT /api/v1/deployments/{deployed_model}/scale response. */
export interface ScaleDeploymentResponse {
  request_id?: string;
  output?: Deployment;
  data?: Deployment;
}

/**
 * PUT /api/v1/deployments/{deployed_model} request body.
 *
 * Update rate limits — at least one of `rpm_limit` / `tpm_limit` is required.
 *   - rpm_limit: requests per minute
 *   - tpm_limit: tokens per minute
 */
export interface UpdateDeploymentRequest {
  rpm_limit?: number;
  tpm_limit?: number;
  [k: string]: unknown;
}

/** PUT /api/v1/deployments/{deployed_model} response. */
export interface UpdateDeploymentResponse {
  request_id?: string;
  output?: Deployment;
  data?: Deployment;
}
