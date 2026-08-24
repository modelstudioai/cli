/** Protocol path constants and the workspace-subdomain URL builder (external API spec; not configurable). */

/**
 * DashScope knowledge API paths. `serviceList` backs the plugin's internal
 * service cache only — it is deliberately NOT exposed as a model tool (a
 * discovery tool reintroduces the "list before you search" round trip this
 * design exists to remove); the management surface uses the bl CLI instead.
 */
export const KB_PATHS = {
  serviceList: '/api/v1/indices/rag/app/list',
  search: '/api/v1/indices/knowledge/search',
  chat: '/api/v2/apps/knowledge/chat',
} as const

/**
 * Build one knowledge API endpoint.
 * @param endpointHost - host suffix, e.g. `cn-beijing.maas.aliyuncs.com`.
 * @param workspaceId - Bailian workspace id used as the subdomain.
 * @param path - one {@link KB_PATHS} value.
 * @returns the absolute endpoint URL.
 */
export function kbEndpoint(endpointHost: string, workspaceId: string, path: string): string {
  return `https://${workspaceId}.${endpointHost}${path}`
}
