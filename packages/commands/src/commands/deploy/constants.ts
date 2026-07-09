/**
 * Deploy-domain constants — billing plans, billing methods and template
 * charge types. Centralised here so no `deploy` command carries a magic
 * string for these server-contract values.
 */

/** Billing plan (`--plan` value, matches the server's deployment plan). */
export const DEPLOY_PLAN = {
  /** Token-billed; the CLI default. */
  LORA: "lora",
  /** Token-billed, provisioned throughput. */
  PTU: "ptu",
  /** Model-unit-billed. */
  MU: "mu",
} as const;

export type DeployPlan = (typeof DEPLOY_PLAN)[keyof typeof DEPLOY_PLAN];

/** CLI default plan when `--plan` is omitted. */
export const DEFAULT_DEPLOY_PLAN: DeployPlan = DEPLOY_PLAN.LORA;

/** Billing method (`billing_method`, plan=mu only). */
export const BILLING_METHOD = {
  /** Post-paid (currently the only server-supported value). */
  POST_PAY: "POST_PAY",
  /** Pre-paid. */
  PRE_PAY: "PRE_PAY",
} as const;

export type BillingMethod = (typeof BILLING_METHOD)[keyof typeof BILLING_METHOD];

/** Default billing method for plan=mu when `--billing-method` is omitted. */
export const DEFAULT_BILLING_METHOD: BillingMethod = BILLING_METHOD.POST_PAY;

/** Template charge type (`charge_type`) returned by the deployable-models catalog. */
export const CHARGE_TYPE = {
  POST_PAID: "post_paid",
  PRE_PAID: "pre_paid",
} as const;

export type ChargeType = (typeof CHARGE_TYPE)[keyof typeof CHARGE_TYPE];
