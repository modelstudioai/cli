/**
 * Bailian knowledge-base consumer plugin: registers kb_service_list, kb_search,
 * and kb_chat over the DashScope RAG API, plus the kscli management skill.
 * @module dsh-tool-bailian-kb
 */

import z from '@deepseek-ai/schemastery'

export const name = 'tool-bailian-kb'
export const inject = ['tools', 'credentials']

/** Bailian knowledge-base plugin configuration. */
export interface Config {
  /** Bailian workspace id; the API host is the workspace subdomain `https://<workspaceId>.<endpointHost>`. */
  workspaceId: string
  /** API host suffix; replace for other regions or private deployments. */
  endpointHost: string
  /** Retrieval-service id pinned by this deployment; when set, the tools' agent_id parameter becomes optional. */
  defaultAgentId?: string
  /** Service version to call: `beta` (draft) or a published number; defaults to the latest published version. Never model-visible. */
  agentVersion?: string
  /** kb_chat timeout in milliseconds; the server side is a minutes-scale agentic loop. */
  chatTimeoutMs: number
}

/** Schemastery validation for {@link Config}; a missing workspaceId fails at load. */
export const Config: z<Config> = z.object({
  workspaceId: z.string().required(),
  endpointHost: z.string().default('cn-beijing.maas.aliyuncs.com'),
  defaultAgentId: z.string(),
  agentVersion: z.string(),
  chatTimeoutMs: z.number().default(300_000),
})
