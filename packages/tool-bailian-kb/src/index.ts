/**
 * Bailian knowledge-base consumer plugin: registers kb_service_list, kb_search,
 * and kb_chat over the DashScope RAG API, plus the kscli management skill.
 * @module dsh-tool-bailian-kb
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { KbClient } from './client.js'
import { registerSkill } from './skill.js'
import { createKbTools } from './tools.js'

export const name = 'tool-bailian-kb'
export const inject = ['tools', 'credentials']

/** Bailian knowledge-base plugin configuration. */
export interface Config {
  /** Bailian workspace id; the API host is the workspace subdomain `https://<workspaceId>.<endpointHost>`. Optional here: an unset value falls back per call to the BAILIAN_WORKSPACE_ID credential (Settings → Plugins card or ~/.dsh/.credentials.yaml). */
  workspaceId?: string
  /** API host suffix; replace for other regions or private deployments. */
  endpointHost: string
  /** Retrieval-service id pinned by this deployment; when unset, the per-call fallback reads the BAILIAN_DEFAULT_AGENT_ID credential. */
  defaultAgentId?: string
  /** Service version to call: `beta` (draft) or a published number; defaults to the latest published version. Never model-visible. */
  agentVersion?: string
  /** kb_chat timeout in milliseconds; the server side is a minutes-scale agentic loop. */
  chatTimeoutMs: number
}

/** Schemastery validation for {@link Config}; workspaceId and defaultAgentId are optional — both resolve per call with a credentials fallback. */
export const Config: z<Config> = z.object({
  workspaceId: z.string(),
  endpointHost: z.string().default('cn-beijing.maas.aliyuncs.com'),
  defaultAgentId: z.string(),
  agentVersion: z.string(),
  chatTimeoutMs: z.number().default(300_000),
})

/**
 * Register the three knowledge tools over one shared client, plus the
 * management skill when a skills registry is composed.
 * @param ctx - registrant context carrying tools and credentials.
 * @param config - deployment's workspace, host, pinning, and timeout choices.
 */
export function apply(ctx: Context, config: Config): void {
  const pinnedWorkspaceId = config.workspaceId
  const pinnedAgentId = config.defaultAgentId
  const client = new KbClient({
    resolveWorkspaceId: pinnedWorkspaceId === undefined
      ? async () => {
          const resolved = await ctx.credentials.resolve(credentialRef('BAILIAN_WORKSPACE_ID'))
          if (!resolved) {
            throw new Error(
              'BAILIAN_WORKSPACE_ID is not configured. Set it in the web UI (Settings → Plugins → Bailian knowledge base) '
              + 'or in ~/.dsh/.credentials.yaml; the workspace id appears as the subdomain of your Bailian endpoints.',
            )
          }
          return resolved.value
        }
      : async () => pinnedWorkspaceId,
    endpointHost: config.endpointHost,
    ...(config.agentVersion ? { agentVersion: config.agentVersion } : {}),
    resolveApiKey: async () => {
      const resolved = await ctx.credentials.resolve(credentialRef('DASHSCOPE_API_KEY'))
      if (!resolved) {
        throw new Error(
          'DASHSCOPE_API_KEY is not configured. Set it in the web UI (Settings → Plugins → Bailian knowledge base) '
          + 'or in ~/.dsh/.credentials.yaml (create a key at https://bailian.console.aliyun.com/?tab=app#/api-key).',
        )
      }
      return resolved.value
    },
  })
  for (const tool of createKbTools({
    client,
    resolveDefaultAgentId: pinnedAgentId !== undefined
      ? async () => pinnedAgentId
      : async () => {
          const resolved = await ctx.credentials.resolve(credentialRef('BAILIAN_DEFAULT_AGENT_ID'))
          return resolved?.value
        },
    chatTimeoutMs: config.chatTimeoutMs,
  })) {
    ctx.tools.register(tool)
  }
  registerSkill(ctx)
}
