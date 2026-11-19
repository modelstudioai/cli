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

/** Running-time billing, shared trial allowance and model-call charges for RAG. */
export const KNOWLEDGE_BILLING_PAGE =
  "https://help.aliyun.com/zh/model-studio/billing-for-knowledge-base";

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

/**
 * Model telemetry doc — guides users to manually authorize the service-linked
 * roles (SLR) required by monitor / log delivery. The CLI only checks SLR
 * status and never creates roles on the user's behalf.
 */
export const MODEL_TELEMETRY_DOC =
  "https://docs.bailian.console.aliyun.com/zh/model-studio/model-telemetry";

/**
 * RL / OPD training docs (environment-preparation section) — guide users to
 * manually authorize the service-linked roles required by RL / OPD training.
 * The CLI only checks role status and never creates roles on the user's behalf.
 */
export const RL_TRAINING_DOC =
  "https://docs.bailian.console.aliyun.com/zh/model-studio/rl-training-overview#%E7%8E%AF%E5%A2%83%E5%87%86%E5%A4%87";
export const OPD_TRAINING_DOC =
  "https://docs.bailian.console.aliyun.com/zh/model-studio/opd-training-overview#%E7%8E%AF%E5%A2%83%E5%87%86%E5%A4%87";
/** OPD docs "模型与训练单元" section: published student/teacher pairs and the recommended MTU capacity. */
export const OPD_MODEL_MATRIX_DOC =
  "https://docs.bailian.console.aliyun.com/zh/model-studio/opd-training-overview#%E6%A8%A1%E5%9E%8B%E4%B8%8E%E8%AE%AD%E7%BB%83%E5%8D%95%E5%85%83";

/**
 * Aliyun billing console refund (unsubscribe) page for one prepaid instance.
 * Unsubscribing a prepaid PTU capacity instance is a billing action that has
 * no API; users complete it here with the account that placed the order.
 */
export function refundConsolePage(instanceId: string): string {
  return `https://billing-cost.console.aliyun.com/refund/refund?instanceId=${encodeURIComponent(instanceId)}`;
}
