import { ExitCode } from "./codes.ts";

export interface ApiErrorContext {
  httpStatus?: number;
  apiCode?: string;
  requestId?: string;
}

export interface BailianErrorOptions {
  cause?: unknown;
  api?: ApiErrorContext;
  rawResponse?: string;
}

export class BailianError extends Error {
  readonly exitCode: ExitCode;
  readonly hint?: string;
  readonly api?: ApiErrorContext;
  readonly rawResponse?: string;

  constructor(
    message: string,
    exitCode: ExitCode = ExitCode.GENERAL,
    hint?: string,
    options?: BailianErrorOptions,
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "BailianError";
    this.exitCode = exitCode;
    this.hint = hint;
    this.api = options?.api;
    this.rawResponse = options?.rawResponse;
  }

  toJSON() {
    const causeJson = serializeCause(this.cause);
    return {
      error: {
        code: this.exitCode,
        message: this.message,
        ...(this.hint ? { hint: this.hint } : {}),
        ...(this.api?.httpStatus !== undefined ? { http_status: this.api.httpStatus } : {}),
        ...(this.api?.apiCode ? { api_code: this.api.apiCode } : {}),
        ...(this.api?.requestId ? { request_id: this.api.requestId } : {}),
        ...(causeJson ? { cause: causeJson } : {}),
      },
    };
  }
}

/** Invalid usage: unknown command, bad/unknown flag, missing required, failed validation. */
export class UsageError extends BailianError {
  constructor(message: string, hint?: string) {
    super(message, ExitCode.USAGE, hint);
    this.name = "UsageError";
  }
}

function serializeCause(cause: unknown): Record<string, unknown> | undefined {
  if (cause == null) return undefined;
  if (cause instanceof Error) {
    const out: Record<string, unknown> = { message: cause.message };
    const code = (cause as NodeJS.ErrnoException).code;
    if (code) out.code = code;
    return out;
  }
  if (typeof cause === "string" || typeof cause === "number" || typeof cause === "boolean") {
    return { message: String(cause) };
  }
  try {
    return { message: JSON.stringify(cause) };
  } catch {
    return undefined;
  }
}
