import { UserError } from "@openagentpack/sdk";
import { BailianError, ExitCode } from "bailian-cli-core";

/**
 * Run an SDK-backed operation, translating SDK error types into BailianError so
 * bl's error handler produces the right exit code and hint formatting.
 * SDK `UserError` → USAGE/GENERAL; any other Error → GENERAL (message passed
 * through, per bl's "don't translate server errors" boundary).
 */
export async function withAgentErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BailianError) throw error;
    if (error instanceof UserError) throw new BailianError(error.message, ExitCode.USAGE);
    if (error instanceof Error) throw new BailianError(error.message, ExitCode.GENERAL);
    throw error;
  }
}
