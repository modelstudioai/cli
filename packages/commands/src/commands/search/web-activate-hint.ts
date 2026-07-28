import {
  isMcpNotActivated,
  mcpActivateHint,
  rethrowWithMcpActivateHint,
} from "../mcp/activate-hint.ts";

/** Detect WebSearch MCP not-activated / invalid 404 errors. */
export const isWebSearchMcpNotActivated = isMcpNotActivated;

/** WebSearch activation hint. */
export function webSearchActivateHint(): string {
  return mcpActivateHint("WebSearch");
}

/** Keep the original message; append a hint for WebSearch not-activated errors. */
export function rethrowWithWebSearchActivateHint(error: unknown): never {
  rethrowWithMcpActivateHint(error, "WebSearch");
}
