/**
 * RL / OPD authorization state machine.
 *
 * Auditable flow: check -> plan -> (confirm) -> enable the requested target ->
 * final recheck. Every capability resolves to one of READY / MISSING / UNKNOWN /
 * REQUIRES_USER_ACTION / FAILED; a failed query is UNKNOWN (never silently
 * treated as enabled or disabled). Service-linked roles are account-level
 * grants the CLI never creates: a missing role reports REQUIRES_USER_ACTION
 * with manual-authorization guidance and blocks enablement. Business
 * enablement only runs when the caller passes `authorize: true`, and only the
 * requested target is enabled — RL never auto-enables OPD and vice versa.
 *
 * The zelda API names and request bodies below mirror the model-training
 * console (customFetcherIo wraps payloads in `{input}` and appends `.m_efm`;
 * fetcherIo payloads use `{reqDTO}`). Response parsing stays defensive: the
 * console host may wrap a scalar flag in `{result}` or `{openStatus}`, so an
 * unrecognized shape degrades to UNKNOWN rather than guessing a state. The SLS
 * step is a static manual advisory: SLS activation is a separate console action
 * (the console's own one-click authorization only creates the service roles),
 * and the SLS OpenAPI needs SLS4-HMAC-SHA256 signing that neither the CLI zelda
 * gateway nor its ACS3 signer provides, so the CLI never probes or opens it.
 */

import { unwrapConsoleResponse } from "../../console/response.ts";
import type { LocalizedText } from "../../types/command.ts";

/** Authorization target: plain reinforcement learning or OPD distillation. */
export type RlAuthTarget = "rl" | "opd";

export type RlAuthStatus = "READY" | "MISSING" | "UNKNOWN" | "REQUIRES_USER_ACTION" | "FAILED";

export interface IRlAuthCheck {
  name: string;
  /** Required checks must be READY for the report to pass; advisory ones may degrade. */
  required: boolean;
  status: RlAuthStatus;
  detail?: string;
}

export interface IRlAuthReport {
  target: RlAuthTarget;
  checks: IRlAuthCheck[];
  /** True when every required check is READY. */
  ok: boolean;
  /** Audit trail of mutations actually attempted (name, or name:failed). */
  actions: string[];
}

/** Console gateway seam: `(api, data) => client.console(api, data)`. */
export type RlConsoleCaller = (api: string, data: Record<string, unknown>) => Promise<unknown>;

export interface IRlAuthOptions {
  target: RlAuthTarget;
  console: RlConsoleCaller;
  workspaceId?: string;
  /** Permit business enablement. Read-only probe when false (default). */
  authorize?: boolean;
  /** Locale selector for user-facing guidance; defaults to en-US when omitted. */
  localize?: (text: LocalizedText) => string;
  /** Console doc URL guiding manual SLR authorization; injected by the command layer. */
  manualAuthDocUrl: string;
}

/**
 * Console zelda API names, aligned with the model-training console. The
 * `.m_efm` suffix and `{input}` wrapper belong to the customFetcherIo family;
 * the telemetry and finetune HTTP APIs use `{reqDTO}` instead.
 */
export const RL_AUTH_API = {
  checkUserWhitelist:
    "zeldaHttp.dashscopeFinetune./zelda/api/v1/finetune/common/checkUserWhitelist",
  queryReinforcementEnabled:
    "zeldaHttp.dashscopeFinetune./zelda/api/v1/finetune/reinforcement/query_reinforcement_enabled",
  queryOpdEnabled: "zeldaHttp.dashscopeFinetune./zelda/api/v1/finetune/opd/query_opd_enabled",
  checkFineTuningSlrAuth: "zeldaEasy.broadscope-platform.modelInstance.checkSlrAuth.m_efm",
  getTelemetrySlrStatus: "zeldaEasy.bailian-telemetry.activate.getTelemetrySlrStatus",
  getTelemetryServiceStatus: "zeldaEasy.bailian-telemetry.activate.getTelemetryServiceStatus",
  enableReinforcement:
    "zeldaHttp.dashscopeFinetune./zelda/api/v1/finetune/reinforcement/enable_reinforcement",
  enableOpd: "zeldaHttp.dashscopeFinetune./zelda/api/v1/finetune/opd/enable_opd",
} as const;

/**
 * SLS log service activation is a manual console step, not a CLI mutation. The
 * SLS OpenAPI (GetSlsService / OpenSlsService) requires SLS4-HMAC-SHA256 signing
 * that the CLI zelda gateway and ACS3 signer do not provide, and the console's
 * own one-click authorization only creates the service roles (the fine-tuning
 * SLR already covers SLS). The check therefore stays a static advisory.
 */
const RL_SLS_GUIDANCE: LocalizedText = {
  "en-US":
    "SLS (Simple Log Service) activation must be completed manually in the Alibaba Cloud console; the CLI cannot open it. Its service-linked role is already covered by the fine-tuning SLR above.",
  "zh-CN":
    "SLS（日志服务）开通需在阿里云控制台手动完成，CLI 无法代为开通；其服务关联角色已由上方 fine-tuning SLR 覆盖。",
};

const WHITELIST_PRODUCT: Record<RlAuthTarget, string> = {
  rl: "agentic_rl",
  opd: "pg_opd",
};

/**
 * Manual SLR authorization guidance. Creating a service-linked role grants
 * cross-service permissions on the user's account, so the CLI only checks the
 * role status and points at the console doc instead of creating it.
 */
function slrManualGuidance(docUrl: string): LocalizedText {
  return {
    "en-US": `The CLI does not create service-linked roles. Follow ${docUrl} to authorize the required roles in the console, then re-run to continue.`,
    "zh-CN": `CLI 不会自动创建服务关联角色。请参照 ${docUrl} 在控制台完成角色授权后重新执行。`,
  };
}

interface IProbeResult {
  status: RlAuthStatus;
  detail?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Compact a raw payload for diagnostics so an UNKNOWN check explains itself. */
function rawSnippet(value: unknown): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    text = String(value);
  }
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/**
 * Extract a boolean state from a gateway business payload. The console host
 * exposes the flag under different keys depending on the API: a bare boolean
 * (origin responses), `{result}` (wrapped scalars), `{openStatus}` (telemetry
 * service) or `{enabled}` (SLS). Returns undefined when no recognizable flag is
 * present so the caller reports UNKNOWN.
 */
export function extractEnabledFlag(response: unknown): boolean | undefined {
  if (typeof response === "boolean") return response;
  if (response === null || typeof response !== "object") return undefined;
  const record = response as Record<string, unknown>;
  const data =
    record.data !== null && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : record;
  for (const key of [
    "enabled",
    "authorized",
    "whitelisted",
    "created",
    "opened",
    "available",
    "result",
    "openStatus",
  ]) {
    const value = data[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

/** Query one capability; a thrown error or unrecognized shape becomes UNKNOWN. */
async function probe(label: string, run: () => Promise<unknown>): Promise<IProbeResult> {
  let payload: unknown;
  try {
    payload = unwrapConsoleResponse(await run());
  } catch (error) {
    const raw = (error as { rawResponse?: unknown }).rawResponse;
    const suffix = raw !== undefined ? ` | raw=${rawSnippet(raw)}` : "";
    return { status: "UNKNOWN", detail: `${label}: ${errorMessage(error)}${suffix}` };
  }
  const enabled = extractEnabledFlag(payload);
  if (enabled === undefined)
    return {
      status: "UNKNOWN",
      detail: `${label}: unrecognized response | raw=${rawSnippet(payload)}`,
    };
  return { status: enabled ? "READY" : "MISSING" };
}

/** Attempt a mutation, recording the outcome in the audit trail. */
async function mutate(
  label: string,
  run: () => Promise<unknown>,
  actions: string[],
): Promise<boolean> {
  try {
    unwrapConsoleResponse(await run());
    actions.push(label);
    return true;
  } catch (error) {
    actions.push(`${label}:failed (${errorMessage(error)})`);
    return false;
  }
}

/**
 * Run the authorization state machine for one target. Read-only by default;
 * pass `authorize: true` to enable the target once its prerequisites (manual
 * role authorization included) are ready. Roles are never created by the CLI;
 * SLS activation is always a manual console step (static advisory).
 */
export async function runRlAuthorization(options: IRlAuthOptions): Promise<IRlAuthReport> {
  const { target, console: call, authorize = false, workspaceId, manualAuthDocUrl } = options;
  const localize =
    options.localize ??
    ((text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]));
  const checks: IRlAuthCheck[] = [];
  const actions: string[] = [];
  const telemetryScope: Record<string, unknown> = workspaceId ? { workspaceId } : {};

  // 1. Admission whitelist (bare boolean). Missing admission is a user action,
  //    not a role gap.
  const whitelist = await probe(RL_AUTH_API.checkUserWhitelist, () =>
    call(RL_AUTH_API.checkUserWhitelist, { reqDTO: { type: WHITELIST_PRODUCT[target] } }),
  );
  checks.push({
    name: "whitelist",
    required: true,
    status: whitelist.status === "MISSING" ? "REQUIRES_USER_ACTION" : whitelist.status,
    detail: whitelist.detail,
  });

  // 2. Fine-tuning service-linked role (shared by FC and SLS); `{input:{role}}`.
  //    A missing role is a manual user action, never a CLI mutation.
  const slrCheckData = { input: { role: "fine-tuning" } };
  let slr = await probe(RL_AUTH_API.checkFineTuningSlrAuth, () =>
    call(RL_AUTH_API.checkFineTuningSlrAuth, slrCheckData),
  );
  if (slr.status === "MISSING") {
    slr = { status: "REQUIRES_USER_ACTION", detail: localize(slrManualGuidance(manualAuthDocUrl)) };
  }
  checks.push({ name: "finetune-slr", required: true, status: slr.status, detail: slr.detail });

  // 3. Telemetry role (advisory; Xtrace SLR); `{reqDTO:{workspaceId,slrType}}`.
  const telemetrySlrData = { reqDTO: { ...telemetryScope, slrType: "Xtrace" } };
  let telemetrySlr = await probe(RL_AUTH_API.getTelemetrySlrStatus, () =>
    call(RL_AUTH_API.getTelemetrySlrStatus, telemetrySlrData),
  );
  if (telemetrySlr.status === "MISSING") {
    telemetrySlr = {
      status: "REQUIRES_USER_ACTION",
      detail: localize(slrManualGuidance(manualAuthDocUrl)),
    };
  }
  checks.push({
    name: "telemetry-slr",
    required: false,
    status: telemetrySlr.status,
    detail: telemetrySlr.detail,
  });

  // 4. AppTrace service activation (advisory). The console opens it via a
  //    purchase page, so a non-ready state always requires a manual user action.
  const appTrace = await probe(RL_AUTH_API.getTelemetryServiceStatus, () =>
    call(RL_AUTH_API.getTelemetryServiceStatus, {
      reqDTO: { ...telemetryScope, serviceType: "AppTrace" },
    }),
  );
  checks.push({
    name: "apptrace-service",
    required: false,
    status: appTrace.status === "READY" ? "READY" : "REQUIRES_USER_ACTION",
    detail: appTrace.detail,
  });

  // 5. SLS log service (advisory). Activation is a manual console step the CLI
  //    cannot perform, so this is a static user-action reminder, never a probe.
  checks.push({
    name: "sls-service",
    required: false,
    status: "REQUIRES_USER_ACTION",
    detail: localize(RL_SLS_GUIDANCE),
  });

  // 6. Business enablement state for the requested target only; `{reqDTO:{}}`.
  const enabledApi =
    target === "opd" ? RL_AUTH_API.queryOpdEnabled : RL_AUTH_API.queryReinforcementEnabled;
  let enabled = await probe(enabledApi, () => call(enabledApi, { reqDTO: {} }));

  // 7. Enable only the requested target, only when authorized and prerequisites
  //    are ready (roles must already be authorized manually in the console).
  //    Never cross-enable the other training mode.
  const prerequisitesReady = whitelist.status === "READY" && slr.status === "READY";
  if (authorize && prerequisitesReady && enabled.status === "MISSING") {
    const enableApi = target === "opd" ? RL_AUTH_API.enableOpd : RL_AUTH_API.enableReinforcement;
    const done = await mutate(enableApi, () => call(enableApi, { reqDTO: {} }), actions);
    enabled = done
      ? await probe(enabledApi, () => call(enabledApi, { reqDTO: {} }))
      : { status: "FAILED" };
  }
  checks.push({
    name: "business-enabled",
    required: true,
    status: enabled.status,
    detail: enabled.detail,
  });

  const ok = checks.every((check) => !check.required || check.status === "READY");
  return { target, checks, ok, actions };
}
