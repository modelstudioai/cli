import { ExitCode } from "./codes.ts";

export interface ApiErrorContext {
  httpStatus?: number;
  apiCode?: string;
  requestId?: string;
}

export interface BailianErrorOptions {
  cause?: unknown;
  api?: ApiErrorContext;
}

export class BailianError extends Error {
  readonly exitCode: ExitCode;
  readonly hint?: string;
  readonly api?: ApiErrorContext;

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

/**
 * The user invoked the CLI in a structurally invalid way: unknown command path,
 * unknown/badly-typed flag, or a missing required argument. Always carries
 * {@link ExitCode.USAGE}. The runtime's error boundary recognises this type and
 * renders the relevant command's help before printing the message — so command
 * code never builds usage strings or prints help itself; it just throws this.
 */
export class UsageError extends BailianError {
  constructor(message: string, hint?: string) {
    super(message, ExitCode.USAGE, hint);
    this.name = "UsageError";
  }
}

/**
 * The command is *incomplete* — a valid prefix that stopped short (a missing
 * required flag / positional). Distinct from {@link UsageError} ("you typed
 * something wrong"): an incomplete command is not an error. The runtime's error
 * boundary renders that command's help and exits 0 — exactly like landing on a
 * command group with no subcommand. Carries {@link ExitCode.SUCCESS}.
 */
export class IncompleteCommandError extends BailianError {
  constructor(message: string) {
    super(message, ExitCode.SUCCESS);
    this.name = "IncompleteCommandError";
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
