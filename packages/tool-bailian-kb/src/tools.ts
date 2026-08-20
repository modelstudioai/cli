/**
 * The two model-facing knowledge tools (kb_search, kb_chat). agent_id is REQUIRED in the schema:
 * a model cannot know from the tool spec whether this deployment configures a default service, and a
 * missing default previously only surfaced at call time, forcing a wasted round-trip. The per-call
 * fallback to a configured default (settings/config or credential) is retained as defense-in-depth,
 * but note defineTool validates args against the schema before execute, so through that entry point
 * the fallback is inert; the model-facing contract is explicit.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SearchRequest, SearchResponse } from './api-types.js'
import { KbApiError, type KbClient } from './client.js'
import { consumeChatStream } from './chat.js'
import { KB_PATHS } from './endpoints.js'

/** Client-side chunk cap applied when the model omits top_k. */
const DEFAULT_TOP_K = 5

export interface KbToolDeps {
  client: KbClient
  /** Resolves the default retrieval agent id per call (settings/patch config or credential); omitted means no default for kb_search. */
  resolveDefaultRetrieveAgentId?: () => Promise<string | undefined>
  /** Resolves the default chat agent id per call (settings/patch config or credential); omitted means no default for kb_chat. */
  resolveDefaultChatAgentId?: () => Promise<string | undefined>
  /** Read per call (a live-settings deployment supplies a getter). */
  chatTimeoutMs: number
}

/**
 * Forward the original tool error unchanged; service discovery now lives
 * in the bl management skill (`bl knowledge service list`), so the tool no
 * longer makes a best-effort API round-trip to enrich the message.
 */
async function withServiceHint(_client: KbClient, err: unknown): Promise<never> {
  throw err
}

/**
 * Build the two tool definitions over one shared client.
 * @param deps - client plus the deployment's explicit pinning and timeout choices.
 * @returns definitions ready for `ctx.tools.register()`.
 */
export function createKbTools(deps: KbToolDeps) {
  // chatTimeoutMs is deliberately NOT destructured: reading it off deps at
  // execute time keeps a live-settings getter live.
  const { client, resolveDefaultRetrieveAgentId, resolveDefaultChatAgentId } = deps
  const agentIdParam = {
    type: 'string' as const,
    required: true as const,
    description: 'Retrieval/Q&A service id. REQUIRED: the schema cannot know whether this deployment '
      + 'configures a default service, so always pass one. Find ids via '
      + '`bl knowledge service list --scene search --workspace-id <workspaceId>` (workspaceId resolves '
      + 'automatically from DSH settings: bailian-kb.workspaceId in ~/.dsh/settings.yaml).',
  }
  const resolveRetrieveAgentId = async (supplied: string | undefined): Promise<string> => {
    if (supplied !== undefined) return supplied
    const defaultId = resolveDefaultRetrieveAgentId === undefined ? undefined : await resolveDefaultRetrieveAgentId()
    if (defaultId === undefined) {
      throw new Error(
        'agent_id is required: no default retrieval service is configured. Pass agent_id explicitly '
        + '(find ids: `bl knowledge service list --scene search --workspace-id <workspaceId>`), or configure a '
        + 'default: bailian-kb.defaultRetrieveAgentId in ~/.dsh/settings.yaml or '
        + 'BAILIAN_DEFAULT_RETRIEVE_AGENT_ID in ~/.dsh/.credentials.yaml.',
      )
    }
    return defaultId
  }
  const resolveChatAgentId = async (supplied: string | undefined): Promise<string> => {
    if (supplied !== undefined) return supplied
    const defaultId = resolveDefaultChatAgentId === undefined ? undefined : await resolveDefaultChatAgentId()
    if (defaultId === undefined) {
      throw new Error(
        'agent_id is required: no default chat service is configured. Pass agent_id explicitly '
        + '(find ids: `bl knowledge service list --scene chat --workspace-id <workspaceId>`), or configure a '
        + 'default: bailian-kb.defaultChatAgentId in ~/.dsh/settings.yaml or '
        + 'BAILIAN_DEFAULT_CHAT_AGENT_ID in ~/.dsh/.credentials.yaml.',
      )
    }
    return defaultId
  }

  const search = defineTool({
    name: 'kb_search',
    description:
      'Semantic search over a Bailian knowledge base. Returns raw knowledge chunks with scores and source '
      + 'references for you to verify, cite, or combine with other context. Retrieval scope and strategy '
      + '(multi-KB weighting, routing, reranking) come from the service configuration. '
      + 'top_k caps how many chunks return (client-side cut of the score-ranked results). '
      + 'Use kb_chat instead when the user question can be answered by the knowledge base alone. '
      + 'Credentials and workspace resolve automatically from DSH config '
      + '(bailian-kb in ~/.dsh/settings.yaml, DASHSCOPE_API_KEY in ~/.dsh/.credentials.yaml) — '
      + 'never read or pass them yourself. agent_id is REQUIRED (see its parameter description).',
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
        agent_id: await resolveRetrieveAgentId(args.agent_id),
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
      + 'The pipeline runs an internal analysis/retrieval loop and may take a few minutes. '
      + 'Credentials and workspace resolve automatically from DSH config '
      + '(bailian-kb in ~/.dsh/settings.yaml, DASHSCOPE_API_KEY in ~/.dsh/.credentials.yaml) — '
      + 'never read or pass them yourself. agent_id is REQUIRED (see its parameter description).',
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
      const chatTimeoutMs = deps.chatTimeoutMs
      const body = {
        input: { messages: [{ role: 'user' as const, content: args.message }] },
        parameters: { agent_options: {
          agent_id: await resolveChatAgentId(args.agent_id),
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

  return [search, chat]
}
