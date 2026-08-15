/**
 * The three model-facing knowledge tools. agent_id stays optional in the schema
 * regardless of deployment: the default service (patch config or credential)
 * can change at runtime through the credentials domain, so the fallback runs
 * per call and a missing default surfaces as an executable error instead of a
 * load-time schema difference.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SearchRequest, SearchResponse } from './api-types.js'
import { KbApiError, type KbClient } from './client.js'
import { consumeChatStream } from './chat.js'
import { KB_PATHS } from './endpoints.js'
import { listServices } from './services.js'

/** Client-side chunk cap applied when the model omits top_k. */
const DEFAULT_TOP_K = 5

export interface KbToolDeps {
  client: KbClient
  /** Resolves the default agent id per call (patch config or credential); omitted means no default. */
  resolveDefaultAgentId?: () => Promise<string | undefined>
  chatTimeoutMs: number
}

/** Format one service list into the error-hint / result text form. */
function formatServices(services: { agent_id: string; name: string; scene: string; status: string }[]): string {
  return services.map(s => `${s.agent_id} (${s.name}, scene=${s.scene}, ${s.status})`).join('; ')
}

/**
 * Append the current service list to a client error so the model can correct
 * an invalid agent_id in one step. Auth failures (401/403) keep their own message.
 * @param client - the shared knowledge API client used for best-effort discovery.
 * @param err - the failure being enriched; always rethrown.
 * @returns never; the original or enriched error is thrown.
 */
async function withServiceHint(client: KbClient, err: unknown): Promise<never> {
  if (err instanceof KbApiError && err.status !== undefined && err.status >= 400 && err.status !== 401 && err.status !== 403) {
    let hint: string | undefined
    try {
      const { services } = await listServices(client, {})
      if (services.length > 0) hint = formatServices(services)
    } catch { /* discovery is best-effort; the original error already carries the failure */ }
    if (hint !== undefined) throw new KbApiError(`${err.message}. Available services: ${hint}`, err.status)
  }
  throw err
}

/**
 * Build the three tool definitions over one shared client.
 * @param deps - client plus the deployment's explicit pinning and timeout choices.
 * @returns definitions ready for `ctx.tools.register()`.
 */
export function createKbTools(deps: KbToolDeps) {
  const { client, resolveDefaultAgentId, chatTimeoutMs } = deps
  const agentIdParam = {
    type: 'string' as const,
    description: 'Retrieval/Q&A service id; omit to use the default service when this deployment configures one (find ids via kb_service_list).',
  }
  const resolveAgentId = async (supplied: string | undefined): Promise<string> => {
    if (supplied !== undefined) return supplied
    const defaultId = resolveDefaultAgentId === undefined ? undefined : await resolveDefaultAgentId()
    if (defaultId === undefined) {
      throw new Error('agent_id is required: no default service is configured; discover services with kb_service_list')
    }
    return defaultId
  }

  const serviceList = defineTool({
    name: 'kb_service_list',
    description:
      'List the Bailian knowledge retrieval/Q&A services available in this workspace. '
      + 'Each entry names the service id (agent_id) to pass to kb_search (scene=search) or kb_chat (scene=chat), '
      + 'its bound knowledge bases, and its status (prefer deployed). '
      + 'Omit scene to see both kinds; narrow large workspaces with name_filter.',
    parameters: {
      scene: { type: 'string', enum: ['chat', 'search'], description: 'Only list services for this scene; omitted lists both.' },
      name_filter: { type: 'string', description: 'Fuzzy match on the service name.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          services: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                agent_id: { type: 'string', required: true },
                name: { type: 'string', required: true },
                scene: { type: 'string', required: true },
                status: { type: 'string', required: true },
                knowledge_bases: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
          total: { type: 'integer', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.services.length === 0
          ? 'No knowledge services found.'
          : `${value.services.length} service(s): ${formatServices(value.services)}`
          + (value.truncated ? ` — listed first ${value.services.length} of ${value.total}; narrow with name_filter.` : ''),
      }],
    },
    async execute(args) {
      return await listServices(client, {
        ...(args.scene === 'chat' || args.scene === 'search' ? { scene: args.scene } : {}),
        ...(args.name_filter ? { nameFilter: args.name_filter } : {}),
      })
    },
    presentCall: args => ({ card: 'generic', title: 'List knowledge services', kind: 'other', rawInput: args }),
  })

  const search = defineTool({
    name: 'kb_search',
    description:
      'Semantic search over a Bailian knowledge base. Returns raw knowledge chunks with scores and source '
      + 'references for you to verify, cite, or combine with other context. Retrieval scope and strategy '
      + '(multi-KB weighting, routing, reranking) come from the service configuration. '
      + 'top_k caps how many chunks return (client-side cut of the score-ranked results). '
      + 'Use kb_chat instead when the user question can be answered by the knowledge base alone.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search query text.' },
      agent_id: agentIdParam,
      top_k: { type: 'integer', description: `Maximum chunks to return; defaults to ${DEFAULT_TOP_K}.` },
      images: { type: 'array', items: { type: 'string' }, description: 'Image URLs for multimodal retrieval.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          chunks: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                text: { type: 'string', required: true },
                score: { type: 'number', required: true },
                doc_name: { type: 'string' },
                doc_id: { type: 'string' },
                title: { type: 'string' },
              },
            },
          },
          total: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.chunks.length === 0
          ? 'No matching knowledge chunks.'
          : value.chunks.map((c, i) => `[${i + 1}] (score ${c.score.toFixed(2)}${c.doc_name ? `, ${c.doc_name}` : ''}) ${c.text}`).join('\n'),
      }],
    },
    async execute(args) {
      const topK = args.top_k ?? DEFAULT_TOP_K
      const body: SearchRequest = {
        query: args.query,
        agent_id: await resolveAgentId(args.agent_id),
        ...(client.agentVersion ? { agent_version: client.agentVersion } : {}),
        ...(args.images && args.images.length > 0 ? { images: args.images } : {}),
      }
      const res = await client.postJson<SearchResponse>(KB_PATHS.search, body).catch(err => withServiceHint(client, err))
      const nodes = (res.data?.nodes ?? []).slice(0, topK)
      return {
        chunks: nodes.map(n => ({
          text: n.text,
          score: n.score,
          ...(typeof n.metadata?.doc_name === 'string' ? { doc_name: n.metadata.doc_name } : {}),
          ...(typeof n.metadata?.doc_id === 'string' ? { doc_id: n.metadata.doc_id } : {}),
          ...(typeof n.metadata?.title === 'string' ? { title: n.metadata.title } : {}),
        })),
        total: res.data?.total ?? nodes.length,
      }
    },
    presentCall: args => ({ card: 'generic', title: 'Search knowledge base', kind: 'search', rawInput: args }),
  })

  const chat = defineTool({
    name: 'kb_chat',
    description:
      'Ask the knowledge base directly and get a complete, domain-tuned answer from a specialized RAG pipeline '
      + '(multi-round retrieval + reranking + grounded generation). For knowledge Q&A this typically outperforms '
      + 'searching and synthesizing yourself when the question can be answered by the knowledge base alone; '
      + 'use kb_search instead when you need raw chunks to verify, cite, or combine with other work. '
      + 'The pipeline runs an internal analysis/retrieval loop and may take a few minutes.',
    parameters: {
      message: { type: 'string', required: true, description: 'The question to ask.' },
      agent_id: agentIdParam,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          answer: { type: 'string', required: true },
          request_id: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.answer.length === 0 ? '(empty answer)' : value.answer }],
    },
    async execute(args) {
      const body = {
        input: { messages: [{ role: 'user' as const, content: args.message }] },
        parameters: { agent_options: {
          agent_id: await resolveAgentId(args.agent_id),
          ...(client.agentVersion ? { agent_version: client.agentVersion } : {}),
        } },
        stream: true as const,
      }
      let res: Response
      try {
        res = await client.postSse(KB_PATHS.chat, body, AbortSignal.timeout(chatTimeoutMs))
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new Error(
            `knowledge chat timed out after ${chatTimeoutMs}ms; the pipeline runs a multi-round retrieval loop `
            + 'and long questions can exceed the deployment timeout. Retry, or use kb_search for raw chunks instead.',
          )
        }
        return await withServiceHint(client, err)
      }
      const { answer, requestId } = await consumeChatStream(res)
      return { answer, ...(requestId ? { request_id: requestId } : {}) }
    },
    presentCall: args => ({ card: 'generic', title: 'Ask knowledge base (may take a few minutes)', kind: 'fetch', rawInput: args }),
  })

  return [serviceList, search, chat]
}
