/**
 * User-facing Aliyun Bailian / Model Studio console URLs.
 *
 * Single source of truth for all `bailian.console.aliyun.com/*` references
 * across cli source. Currently pinned to cn-beijing — expand to a region map
 * if/when overseas console support is added.
 */

/** Root entry — generic console landing, region picker. */
export const BAILIAN_CONSOLE_ROOT = "https://bailian.console.aliyun.com";

/** Region-pinned console base. Add a region map if/when overseas is supported. */
export const BAILIAN_CONSOLE = `${BAILIAN_CONSOLE_ROOT}/cn-beijing`;

/** Direct deep link to API key management page. */
export const API_KEY_PAGE = `${BAILIAN_CONSOLE}/?tab=app#/api-key`;

/** Direct deep link to the Token Plan subscription overview and API key entry. */
export const TOKEN_PLAN_PAGE = `${BAILIAN_CONSOLE_ROOT}/cn-beijing?tab=plan#/efm/subscription/overview`;

/** MCP marketplace detail page for a server code (e.g. WebSearch, market-cmapi00073529). */
export function mcpMarketplaceDetailPage(serverCode: string): string {
  return `${BAILIAN_CONSOLE}?tab=mcp#/mcp-market/detail/${serverCode}`;
}

/**
 * MCP marketplace detail for the built-in WebSearch server.
 * Users must activate (or re-activate for Streamable HTTP) before `search web` works.
 */
export const MCP_WEBSEARCH_PAGE = mcpMarketplaceDetailPage("WebSearch");

/** Voice TTS experience center — browse system and custom voices. */
export const VOICE_TTS_PAGE = "https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list";
