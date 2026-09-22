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
  /** Aggregate effective reservation capacity, in kTPM. */
  ptu_capacity?: ReservationCapacity;
  /** ptu_fast | ptu_default | future service tiers. */
  ptu_service_tier?: string;
  pre_paid_info?: PrePaidInfo;
  pre_paid_instance_id?: string;
  pre_paid_gmt_expired?: string;
  /** enable | disable | future overflow strategies. */
  overflow_strategy?: string;
  fail_reason?: string;
  operation_id?: string;
  instance_id?: string;
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

/** Reservation capacity returned by queries; separate from legacy PTU write input. */
export interface ReservationCapacity {
  /** Input capacity in kTPM (1 kTPM = 1000 tokens/minute); zero is valid. */
  input_tpm?: number;
  /** Output capacity in kTPM; zero is valid. */
  output_tpm?: number;
  [key: string]: unknown;
}

/** Prepaid purchase and renewal configuration returned by queries. */
export interface PrePaidInfo {
  /** Purchase / renewal duration in days. */
  duration?: number;
  auto_renewal?: boolean;
  /** Automatic renewal duration in days. */
  auto_renewal_duration?: number;
  /** Renewal cycle unit, e.g. Day. */
  auto_renewal_cycle?: string;
  [key: string]: unknown;
}

/** A capacity instance returned by list/detail queries, including released instances. */
export interface CapacityInstance {
  /** The deployment's ModelCode. Identifiers are opaque strings. */
  model_service_id?: string;
  instance_id?: string;
  /** pre_paid | post_paid | future charge types. */
  charge_type?: string;
  /** Instance lifecycle state; future states are preserved. */
  status?: string;
  deleted?: boolean;
  /** Currently confirmed serving capacity. */
  effective_capacity?: ReservationCapacity;
  /** Configured / contracted capacity, which may remain while stopped or suspended. */
  configured_capacity?: ReservationCapacity;
  /** Pending target, not effective capacity; may be absent or null in a stable state. */
  target_capacity?: ReservationCapacity | null;
  pre_paid_info?: PrePaidInfo;
  gmt_expired?: string;
  can_scale?: boolean;
  can_renew?: boolean;
  can_delete?: boolean;
  fail_reason?: string;
  gmt_created?: string;
  gmt_modified?: string;
  gmt_deleted?: string;
  [key: string]: unknown;
}

/** A capacity operation returned by a query; no state or identifier normalization. */
export interface CapacityOperation {
  operation_id?: string;
  /** Original operation request ID, distinct from the query response's request_id. */
  request_id?: string;
  /** CREATE | SCALE | RENEW | DELETE | STOP | REFUND | future operation types. */
  operation_type?: string;
  /** PROCESSING | SUCCEEDED | FAILED | future operation states. */
  operation_status?: string;
  model_service_id?: string;
  instance_id?: string;
  from_status?: string;
  current_status?: string;
  error_code?: string;
  error_message?: string;
  gmt_created?: string;
  gmt_finished?: string;
  [key: string]: unknown;
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
  /** Optional display name; PTU creation generates one when omitted. */
  name?: string;
  /** Required. Billing plan: mu | cu | ptu | lora. CLI defaults to "lora". */
  plan: string;
  /** Required for PTU creation; distinct from instance billing_method. */
  charge_type?: "pre_paid" | "post_paid";
  /** PTU performance tier; the service defaults to ptu_fast. */
  service_tier?: "ptu_fast" | "ptu_default";
  /** Optional ModelCode suffix; generated by the service when omitted. */
  suffix?: string;
  /** Required for prepaid PTU creation; omitted for postpaid. */
  pre_paid_info?: PrePaidInfo;
  /** Required by API even for token-billed (lora) plans where it is ignored — CLI injects 1. */
  capacity?: number;
  /** Deploy spec id (e.g. "MU1", "dps-..."), sent as `deploy_spec` in POST body. */
  deploy_spec?: string;
  /** Required PTU capacity in kTPM; values are forwarded without conversion. */
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

/** Legacy PTU input shape, retained for source compatibility. */
export interface PtuCapacity {
  /** Input capacity in kTPM. */
  input_tpm?: number;
  /** Output capacity in kTPM. */
  output_tpm?: number;
  /** @deprecated Current reservation models do not support separate thinking-output capacity. */
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

/** GET /api/v1/deployments/{deployed_model}/capacity-instances response. */
export interface ListCapacityInstancesResponse {
  request_id?: string;
  output?: {
    records?: CapacityInstance[];
    /** Total record count, not the current page's records. */
    items?: number;
    page?: number;
    itemsPerPage?: number;
    pageCount?: number;
    [key: string]: unknown;
  };
  data?: ListCapacityInstancesResponse["output"];
  [key: string]: unknown;
}

/** GET /api/v1/deployments/{deployed_model}/capacity-instances/{instance_id} response. */
export interface GetCapacityInstanceResponse {
  request_id?: string;
  output?: CapacityInstance;
  data?: CapacityInstance;
  [key: string]: unknown;
}

/** GET /api/v1/deployments/{deployed_model}/capacity-operations/{operation_id} response. */
export interface GetCapacityOperationResponse {
  request_id?: string;
  output?: CapacityOperation;
  data?: CapacityOperation;
  [key: string]: unknown;
}

/** Instance writes return an operation, including HTTP 200 responses with status FAILED. */
export type CapacityOperationResponse = GetCapacityOperationResponse;

/** POST /api/v1/deployments/{deployed_model}/capacity-instances request body. */
export interface CreateCapacityInstanceRequest {
  billing_method: "PRE_PAY" | "POST_PAY";
  ptu_capacity: ReservationCapacity;
  /** Required for PRE_PAY; omitted for POST_PAY. */
  pre_paid_info?: PrePaidInfo;
}

/** PUT /api/v1/deployments/{deployed_model}/capacity-instances/{instance_id}/scale body. */
export interface ScaleCapacityInstanceRequest {
  /** Absolute target capacity for this instance, not a delta or deployment total. */
  ptu_capacity: ReservationCapacity;
  /** Omit to reuse saved prepaid information; do not send for postpaid. */
  pre_paid_info?: PrePaidInfo;
  order_type?: "UPGRADE" | "DOWNGRADE";
}

/** PUT /api/v1/deployments/{deployed_model}/capacity-instances/{instance_id}/renew body. */
export interface RenewCapacityInstanceRequest {
  pre_paid_info: PrePaidInfo;
  /** Required to be true when changing capacity; defaults to false on the service. */
  is_change?: boolean;
  ptu_capacity?: ReservationCapacity;
}

/** PUT /api/v1/deployments/{deployed_model}/update-overflowstrategy response. */
export type UpdateDeploymentOverflowResponse = GetDeploymentResponse;

/** DELETE /api/v1/deployments/{deployed_model} response, including legacy deleted flags. */
export interface DeleteDeploymentResponse {
  request_id?: string;
  output?: Deployment & { deleted?: boolean };
  data?: Deployment & { deleted?: boolean };
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
  /** New capacity in legacy MU plan units. */
  capacity?: number;
  /** Required for PTU when more than one undeleted instance exists. */
  instance_id?: string;
  /** Absolute PTU target capacity for the selected instance, in kTPM. */
  ptu_capacity?: ReservationCapacity;
  pre_paid_info?: PrePaidInfo;
  order_type?: "UPGRADE" | "DOWNGRADE";
  /** Legacy top-level PTU fields retained for source compatibility. */
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
