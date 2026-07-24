import { BailianError } from "bailian-cli-core";
import { MCP_WEBSEARCH_PAGE } from "bailian-cli-runtime";

/** recoginze WebSearch MCP not activated / invalid caused 404 (CLI wrapped message from server)。 */
export function isWebSearchMcpNotActivated(error: unknown): boolean {
  if (!(error instanceof BailianError)) return false;
  const message = error.message;
  if (!/MCP request failed:\s*404\b/i.test(message)) return false;
  return /未开通|MCP不存在|MCP_IS_INVALID/i.test(message);
}

/** activate hint; URL from runtime/urls.ts。 */
export function webSearchActivateHint(): string {
  return [
    "Activate (or re-activate) the WebSearch MCP in the Bailian MCP marketplace, then retry.",
    "If it was previously on SSE, cancel and activate again to upgrade to Streamable HTTP.",
    `Open: ${MCP_WEBSEARCH_PAGE}`,
  ].join("\n");
}

/**
 * keep original message / exitCode for not activated errors, add hint only; other errors throw as is.
 * do not replace server error message.
 */
export function rethrowWithWebSearchActivateHint(error: unknown): never {
  if (isWebSearchMcpNotActivated(error) && error instanceof BailianError && !error.hint) {
    throw new BailianError(error.message, error.exitCode, webSearchActivateHint(), {
      cause: error,
      api: error.api,
      rawResponse: error.rawResponse,
    });
  }
  throw error;
}
