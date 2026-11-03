import { BailianError, type BailianErrorOptions } from "./base.ts";
import { ExitCode } from "./codes.ts";

export type CredentialFailure =
  | "missing-api-key"
  | "missing-console-token"
  | "expired-console-session"
  | "missing-openapi-pair"
  | "incomplete-openapi-flag"
  | "incomplete-openapi-env"
  | "incomplete-openapi-config";

/** Local credential failure facts; CLI recovery instructions belong to the host. */
export class CredentialError extends BailianError {
  constructor(
    readonly reason: CredentialFailure,
    message: string,
    hint?: string,
    options?: BailianErrorOptions,
  ) {
    super(message, ExitCode.AUTH, hint, options);
  }
}
