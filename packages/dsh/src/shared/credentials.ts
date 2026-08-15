/**
 * Pure credential classification and pairing shared by the plugins that call
 * pay-as-you-go DashScope APIs directly (memory, knowledge base) or through
 * `bl managed-agent` (agentstudio). No runtime imports — this module is safe
 * to load from tests and its rules are locked by `tests/credentials.test.ts`.
 *
 * TokenPlan keys (`sk-sp-`) and pay-as-you-go keys (`sk-ws-`) are not
 * interchangeable: the TokenPlan gateway 401s a pay-as-you-go key, and the
 * service APIs this package calls 401 or 404 a TokenPlan key. The LLM
 * provider row keeps its TokenPlan key under a dedicated env name
 * (`BAILIAN_TOKENPLAN_API_KEY`); every other plugin needs a pay-as-you-go key
 * and rejects a TokenPlan one up front instead of failing at request time.
 *
 * @module bailian-cli-dsh/shared/credentials
 */

/**
 * Standard DashScope model-domain endpoint. It serves the model APIs plus the
 * memory v2 and knowledge indices the plugins call directly — but NOT
 * `/api/v1/agentstudio`, which lives on the workspace-scoped host.
 */
export const DASHSCOPE_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com";

/** Key prefix that marks a TokenPlan key (which service APIs reject). */
export const TOKEN_PLAN_KEY_PREFIX = "sk-sp-";

/** Whether a key is shaped like a TokenPlan key (which service APIs reject). */
export function isTokenPlanKey(apiKey: string): boolean {
  return apiKey.startsWith(TOKEN_PLAN_KEY_PREFIX);
}

/**
 * Whether a base URL points at the TokenPlan gateway. That gateway serves the
 * model-inference routes only — none of the service APIs this package calls,
 * including `/api/v1/agentstudio`, so requests to it 404.
 */
export function isTokenPlanEndpoint(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.startsWith("token-plan.");
  } catch {
    // An unparseable URL fails the request later with its own diagnostics;
    // this check only classifies well-formed endpoints.
    return false;
  }
}

/**
 * The standard error wording every plugin uses when it resolves a TokenPlan
 * key, so all three surfaces fail with one recognizable, actionable message.
 */
export function tokenPlanKeyRejection(plugin: string, capability: string): string {
  return (
    `${plugin}: the resolved API key is a TokenPlan key (${TOKEN_PLAN_KEY_PREFIX}…), which ` +
    `${capability} rejects. Use a pay-as-you-go key (sk-ws-): set \`apiKey\` in this row's ` +
    "config or $DASHSCOPE_API_KEY. TokenPlan keys belong on $BAILIAN_TOKENPLAN_API_KEY, " +
    "which only the `bailian-tokenplan` LLM provider reads."
  );
}

/**
 * Build the `--api-key` / `--base-url` flags handed to `bl managed-agent run`.
 * Each resolved half ships independently:
 *
 * - A resolved key becomes `--api-key`, overriding bl's auth chain so an
 *   active TokenPlan profile cannot substitute its own key.
 * - A resolved endpoint becomes `--base-url`, overriding the ACTIVE PROFILE's
 *   base_url — the half that fixes the classic `Bailian API 404`, where a
 *   TokenPlan (or bare model-domain) origin does not serve
 *   `/api/v1/agentstudio`.
 *
 * There is deliberately NO fallback endpoint: agentstudio is only served on
 * the workspace-scoped host (see {@link workspaceEndpoint}), and an unknown
 * workspace is a configuration gap, not a defaultable value. Unresolved halves
 * emit nothing and bl's own auth chain decides them.
 */
export function credentialFlags(apiKey: string | undefined, baseUrl: string | undefined): string[] {
  const flags: string[] = [];
  if (baseUrl !== undefined && baseUrl.length > 0) flags.push("--base-url", baseUrl);
  if (apiKey !== undefined && apiKey.length > 0) flags.push("--api-key", apiKey);
  return flags;
}

/**
 * Compose the workspace-scoped agentstudio host for a workspace id. The
 * managed-agent API is served only from
 * `https://{workspace}.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio`
 * (bl/the SDK append the resource path onto this origin); the plain
 * dashscope origin 404s it, and a key only unlocks its own workspace's host
 * (a mismatched one 403s `Endpoint.AccessDenied`).
 */
export function workspaceEndpoint(workspaceId: string): string {
  return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com`;
}
