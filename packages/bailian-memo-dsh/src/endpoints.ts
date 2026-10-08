/**
 * Workspace-scoped Memory API URL builders (self-contained; no bailian-cli-core).
 */

/** Same workspace gateway host as bailian-cli-core / bailian-kb-dsh. */
const DEFAULT_ENDPOINT_HOST = "cn-beijing.maas.aliyuncs.com";

/** Build `https://{workspaceId}.{host}{path}`. */
export function memoryEndpoint(
  workspaceId: string,
  path: string,
  endpointHost: string = DEFAULT_ENDPOINT_HOST,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${workspaceId}.${endpointHost}${normalizedPath}`;
}

export function memoryAddAsyncPath(): string {
  return "/api/v2/apps/memory/add-async";
}

export function memoryEventPath(eventId: string): string {
  return `/api/v2/apps/memory/events/${encodeURIComponent(eventId)}`;
}

export function memorySearchPath(): string {
  return "/api/v2/apps/memory/memory_nodes/search";
}

export function memoryListPath(): string {
  return "/api/v2/apps/memory/memory_nodes";
}

export function memoryNodePath(nodeId: string): string {
  return `/api/v2/apps/memory/memory_nodes/${encodeURIComponent(nodeId)}`;
}

export function profileSchemaPath(): string {
  return "/api/v2/apps/memory/profile_schemas";
}

export function profileSchemaItemPath(schemaId: string): string {
  return `/api/v2/apps/memory/profile_schemas/${encodeURIComponent(schemaId)}`;
}

export function userProfilePath(schemaId: string): string {
  return `${profileSchemaItemPath(schemaId)}/user_profile`;
}

export function userProfileValuesPath(schemaId: string): string {
  return `${profileSchemaItemPath(schemaId)}/profile_values`;
}

export { DEFAULT_ENDPOINT_HOST };
