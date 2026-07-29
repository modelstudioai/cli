import { BailianError } from "bailian-cli-core";
import { mcpMarketplaceDetailPage } from "bailian-cli-runtime";

/** Detect MCP-not-activated / invalid 404 errors (CLI-wrapped server message). */
export function isMcpNotActivated(error: unknown): boolean {
  if (!(error instanceof BailianError)) return false;
  const message = error.message;
  if (!/MCP request failed:\s*404\b/i.test(message)) return false;
  return /未开通|MCP不存在|MCP_IS_INVALID/i.test(message);
}

/** Activation hint; URL from runtime/urls.ts. */
export function mcpActivateHint(serverCode: string): string {
  const lines = [
    `Activate (or re-activate) the ${serverCode} MCP in the Bailian MCP marketplace, then retry.`,
  ];
  if (serverCode === "WebSearch") {
    lines.push(
      "If it was previously on SSE, cancel and activate again to upgrade to Streamable HTTP.",
    );
  }
  lines.push(`Open: ${mcpMarketplaceDetailPage(serverCode)}`);
  return lines.join("\n");
}

/**
 * For not-activated errors, keep the original message / exitCode and append a hint only.
 * Do not replace the server error message.
 */
export function rethrowWithMcpActivateHint(error: unknown, serverCode: string): never {
  if (isMcpNotActivated(error) && error instanceof BailianError && !error.hint) {
    throw new BailianError(error.message, error.exitCode, mcpActivateHint(serverCode), {
      cause: error,
      api: error.api,
      rawResponse: error.rawResponse,
    });
  }
  throw error;
}
