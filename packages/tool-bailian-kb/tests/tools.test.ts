import { describe, expect, it, vi } from 'vitest'
import { KbApiError, KbClient } from '../src/client.js'
import { createKbTools } from '../src/tools.js'

const EXEC = {} as never

function toolsWith(postJson: unknown, postSse?: unknown, resolveDefaultRetrieveAgentId?: () => Promise<string | undefined>, resolveDefaultChatAgentId?: () => Promise<string | undefined>) {
  const client = { postJson, postSse, agentVersion: undefined } as unknown as KbClient
  const list = createKbTools({ client, ...(resolveDefaultRetrieveAgentId ? { resolveDefaultRetrieveAgentId } : {}), ...(resolveDefaultChatAgentId ? { resolveDefaultChatAgentId } : {}), chatTimeoutMs: 1000 })
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
  it('registers kb_search and kb_chat', () => {
    const { list } = toolsWith(vi.fn())
    expect(list.map(t => t.name).sort()).toEqual(['kb_chat', 'kb_search'])
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

  it('agent_id is required in the schema for both tools', () => {
    const { byName } = toolsWith(vi.fn())
    // defineTool compiles the spec into JSON Schema: requiredness lives in the top-level `required` array.
    const requiredList = (tool: { parameters: Record<string, unknown> }) =>
      (tool.parameters.required ?? []) as string[]
    expect(requiredList(byName.kb_search!)).toContain('agent_id')
    expect(requiredList(byName.kb_chat!)).toContain('agent_id')
  })

  it('a missing agent_id is rejected by schema validation before execute (even with a default resolver)', async () => {
    const postJson = vi.fn(async (_path: string, _body: unknown) => searchResponse)
    const resolveDefaultRetrieveAgentId = vi.fn(async () => 'aid-fixed')
    const { byName } = toolsWith(postJson, undefined, resolveDefaultRetrieveAgentId)
    // defineTool validates args against the compiled schema before execute runs,
    // so with agent_id required the per-call default fallback is never consulted
    // through this entry point; it stays as defense-in-depth only.
    const err = await byName.kb_search!.execute({ query: 'q' }, EXEC).catch((e: unknown) => e)
    expect((err as Error).message).toContain('agent_id')
    expect(resolveDefaultRetrieveAgentId).not.toHaveBeenCalled()
    expect(postJson).not.toHaveBeenCalled()
  })

  it('a missing agent_id without any default is also a schema rejection, not the runtime guidance error', async () => {
    const { byName } = toolsWith(vi.fn())
    const err = await byName.kb_search!.execute({ query: 'q' }, EXEC).catch((e: unknown) => e)
    expect((err as Error).message).toContain('missing required property')
  })

  it('a supplied agent_id bypasses the default resolver entirely', async () => {
    const postJson = vi.fn(async (_path: string, _body: unknown) => searchResponse)
    const resolveDefaultRetrieveAgentId = vi.fn(async () => 'aid-default')
    const { byName } = toolsWith(postJson, undefined, resolveDefaultRetrieveAgentId)
    await byName.kb_search!.execute({ query: 'q', agent_id: 'aid-explicit' }, EXEC)
    expect(resolveDefaultRetrieveAgentId).not.toHaveBeenCalled()
    expect((postJson.mock.calls[0]![1] as Record<string, unknown>).agent_id).toBe('aid-explicit')
  })

  it('a 4xx failure passes the original error through unchanged', async () => {
    const postJson = vi.fn(async (_path: string) => {
      throw new KbApiError('agent not found', 400)
    })
    const { byName } = toolsWith(postJson)
    const err = await byName.kb_search!.execute({ query: 'q', agent_id: 'bad' }, EXEC).catch((e: unknown) => e)
    expect((err as Error).message).toBe('agent not found')
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

  it('kb_chat reads chatTimeoutMs off deps per call (live-settings getter stays live)', async () => {
    const timeout = Object.assign(new Error('operation timed out'), { name: 'TimeoutError' })
    const postSse = vi.fn(async () => { throw timeout })
    const client = { postJson: vi.fn(), postSse, agentVersion: undefined } as unknown as KbClient
    // Mirrors the host apply: a getter over the mutable settings source.
    let timeoutMs = 1000
    const list = createKbTools({ client, get chatTimeoutMs() { return timeoutMs } })
    const chat = list.find(t => t.name === 'kb_chat')!
    timeoutMs = 2222
    const err = await chat.execute({ message: 'q', agent_id: 'aid-1' }, EXEC).catch((e: unknown) => e)
    expect((err as Error).message).toContain('2222ms')
  })
})
