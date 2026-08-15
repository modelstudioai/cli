import { describe, expect, it, vi } from 'vitest'
import { KbApiError, KbClient } from '../src/client.js'
import { createKbTools } from '../src/tools.js'

const EXEC = {} as never

function toolsWith(postJson: unknown, postSse?: unknown, resolveDefaultAgentId?: () => Promise<string | undefined>) {
  const client = { postJson, postSse, agentVersion: undefined } as unknown as KbClient
  const list = createKbTools({ client, ...(resolveDefaultAgentId ? { resolveDefaultAgentId } : {}), chatTimeoutMs: 1000 })
  const byName = Object.fromEntries(list.map(t => [t.name, t]))
  return { byName, list }
}

const searchResponse = {
  request_id: 'r1',
  data: { total: 3, nodes: [
    { score: 0.9, text: 'A', metadata: { doc_name: 'd1' } },
    { score: 0.8, text: 'B', metadata: {} },
    { score: 0.7, text: 'C', metadata: {} },
  ] },
}

describe('createKbTools', () => {
  it('registers exactly kb_service_list, kb_search, kb_chat', () => {
    const { list } = toolsWith(vi.fn())
    expect(list.map(t => t.name).sort()).toEqual(['kb_chat', 'kb_search', 'kb_service_list'])
  })

  it('kb_search truncates nodes client-side to top_k and never sends top_k to the server', async () => {
    const postJson = vi.fn(async (_path: string, _body: unknown) => searchResponse)
    const { byName } = toolsWith(postJson)
    const out = await byName.kb_search!.execute({ query: 'q', agent_id: 'aid-1', top_k: 2 }, EXEC) as { chunks: unknown[] }
    expect(out.chunks).toHaveLength(2)
    const body = postJson.mock.calls[0]![1] as Record<string, unknown>
    expect(body).not.toHaveProperty('top_k')
    expect(body.agent_id).toBe('aid-1')
  })

  it('agent_id stays optional in the schema regardless of a configured default', () => {
    const withoutDefault = toolsWith(vi.fn()).byName.kb_search!
    const withDefault = toolsWith(vi.fn(), undefined, async () => 'aid-fixed').byName.kb_search!
    // defineTool compiles the spec into JSON Schema: requiredness lives in the top-level `required` array.
    const requiredList = (tool: { parameters: Record<string, unknown> }) =>
      (tool.parameters.required ?? []) as string[]
    // The default can arrive or leave at runtime via the credentials domain, so
    // the schema cannot promise requiredness either way.
    expect(requiredList(withoutDefault)).not.toContain('agent_id')
    expect(requiredList(withDefault)).not.toContain('agent_id')
  })

  it('kb_search falls back to the per-call default resolver as an explicit resolve step', async () => {
    const postJson = vi.fn(async (_path: string, _body: unknown) => searchResponse)
    const { byName } = toolsWith(postJson, undefined, async () => 'aid-fixed')
    await byName.kb_search!.execute({ query: 'q' }, EXEC)
    expect((postJson.mock.calls[0]![1] as Record<string, unknown>).agent_id).toBe('aid-fixed')
  })

  it('a missing agent_id without any default resolves to executable discovery guidance', async () => {
    const postJson = vi.fn(async (_path: string, _body: unknown) => searchResponse)
    const { byName } = toolsWith(postJson)
    const err = await byName.kb_search!.execute({ query: 'q' }, EXEC).catch((e: unknown) => e)
    expect((err as Error).message).toContain('kb_service_list')
  })

  it('kb_search re-resolves the default per call (credential hot-swap contract)', async () => {
    const postJson = vi.fn(async (_path: string, _body: unknown) => searchResponse)
    let current: string | undefined
    const resolveDefaultAgentId = vi.fn(async () => current)
    const { byName } = toolsWith(postJson, undefined, resolveDefaultAgentId)
    current = 'aid-one'
    await byName.kb_search!.execute({ query: 'q' }, EXEC)
    current = undefined
    await byName.kb_search!.execute({ query: 'q' }, EXEC).catch(() => {})
    expect(resolveDefaultAgentId).toHaveBeenCalledTimes(2)
    expect((postJson.mock.calls[0]![1] as Record<string, unknown>).agent_id).toBe('aid-one')
    expect(postJson).toHaveBeenCalledTimes(1)
  })

  it('a 4xx failure appends the current service list to the error', async () => {
    const postJson = vi.fn(async (path: string) => {
      if (path === '/api/v1/indices/knowledge/search') throw new KbApiError('agent not found', 400)
      return { data: { total_count: 1, rows: [{ agent_id: 'aid-9', agent_name: 'faq', agent_scene: 'search', agent_status: 'deployed' }] } }
    })
    const { byName } = toolsWith(postJson)
    const err = await byName.kb_search!.execute({ query: 'q', agent_id: 'bad' }, EXEC).catch((e: unknown) => e)
    expect((err as Error).message).toContain('aid-9')
  })

  it('kb_chat buffers the SSE stream into one answer', async () => {
    const sse = 'data: {"output":{"choices":[{"message":{"content":"hi"},"finish_reason":"stop"}]},"request_id":"r2"}\n\ndata: [DONE]\n\n'
    const postSse = vi.fn(async () => new Response(sse, { status: 200 }))
    const { byName } = toolsWith(vi.fn(), postSse)
    const out = await byName.kb_chat!.execute({ message: 'q', agent_id: 'aid-1' }, EXEC) as { answer: string }
    expect(out.answer).toBe('hi')
  })

  it('kb_chat translates a timeout into retry-or-search guidance', async () => {
    const timeout = Object.assign(new Error('operation timed out'), { name: 'TimeoutError' })
    const postSse = vi.fn(async () => { throw timeout })
    const { byName } = toolsWith(vi.fn(), postSse)
    const err = await byName.kb_chat!.execute({ message: 'q', agent_id: 'aid-1' }, EXEC).catch((e: unknown) => e)
    expect((err as Error).message).toMatch(/timed out.*kb_search/s)
  })
})
