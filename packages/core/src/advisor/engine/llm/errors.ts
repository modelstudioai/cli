/**
 * Classified LLM failure. The engine stays free of bailian-cli-core, so the
 * command layer maps this onto host-native errors (ctx.errors).
 */
export type LLMErrorKind =
  | "rate_limit" // HTTP 429: quota / throttling
  | "auth" // HTTP 401/403: invalid key or no permission
  | "http" // other non-2xx
  | "timeout" // request aborted by timeout
  | "cancelled" // 调用方取消整次执行，不允许降级重跑
  | "network" // fetch-level failure (DNS, TLS, reset)
  | "parse"; // response arrived but no valid JSON could be extracted

/** Pipeline stage where the failure happened (set by the caller that caught it). */
export type LLMStage = "intent" | "holistic-score" | "explain" | "agent";

export interface LLMErrorInit {
  status?: number;
  code?: string;
  requestId?: string;
  stage?: LLMStage;
  cause?: unknown;
}

export class LLMError extends Error {
  readonly kind: LLMErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  stage?: LLMStage;

  constructor(kind: LLMErrorKind, message: string, init: LLMErrorInit = {}) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "LLMError";
    this.kind = kind;
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.stage = init.stage;
  }

  /**
   * Fatal = retrying the same request right away will fail the same way
   * (quota exhausted, bad credentials). Callers must not fall back to
   * re-running the engine on a fatal error — it only burns more quota.
   */
  get fatal(): boolean {
    return this.kind === "rate_limit" || this.kind === "auth" || this.kind === "cancelled";
  }

  /** Short tag for trace/degradation strings, e.g. "429 rate_limit". */
  get tag(): string {
    return this.status ? `${this.status} ${this.kind}` : this.kind;
  }
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason: unknown = signal.reason;
  throw new LLMError("cancelled", reason instanceof Error ? reason.message : "执行已取消", {
    cause: reason,
  });
}

export function kindFromStatus(status: number): LLMErrorKind {
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth";
  return "http";
}

/** Minimal structural view of a degradation entry (mirrors types.ts Degradation, avoids an import cycle). */
export interface DegradationEntry {
  stage: string;
  fallback: string;
  kind: string;
  status?: number;
  message: string;
}

export function toDegradation(stage: LLMStage, fallback: string, err: LLMError): DegradationEntry {
  return { stage, fallback, kind: err.kind, status: err.status, message: err.message };
}

/** One-line form used in the `[recommend] ... degraded=` log, e.g. "llm-generate→template-text (429 rate_limit)". */
export function formatDegradation(entry: DegradationEntry): string {
  const tag = entry.status ? `${entry.status} ${entry.kind}` : entry.kind;
  return `${entry.fallback} (${tag})`;
}

/** Normalize anything thrown inside an LLM step into an LLMError tagged with its stage. */
export function toLLMError(err: unknown, stage: LLMStage): LLMError {
  if (err instanceof LLMError) {
    err.stage ??= stage;
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  // extractJson throws a plain Error; anything else unexpected is reported as parse too
  return new LLMError("parse", message, { stage, cause: err });
}
