import { describe, expect, it, vi } from 'vitest'
import { KbApiError, KbClient } from '../src/client.js'

function makeClient(fetchImpl: typeof fetch) {
  return new KbClient({
    resolveWorkspaceId: async () => 'ws-1',
    endpointHost: 'cn-beijing.maas.aliyuncs.com',
    resolveApiKey: async () => 'sk-test',
    fetchImpl,
  })
}

describe('KbClient.postJson', () => {
  it('sends Bearer auth to the workspace endpoint and returns parsed JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const result = await client.postJson<{ ok: number }>('/api/v1/indices/knowledge/search', { query: 'q' })
    expect(result.ok).toBe(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ws-1.cn-beijing.maas.aliyuncs.com/api/v1/indices/knowledge/search')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect(init.method).toBe('POST')
  })

  it('translates a non-2xx into KbApiError with status and a bounded body summary', async () => {
    const body = JSON.stringify({ code: 'InvalidParameter', message: 'agent not found' })
    const fetchImpl = vi.fn(async () => new Response(body, { status: 400 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const err = await client.postJson('/api/v1/indices/knowledge/search', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(KbApiError)
    expect((err as KbApiError).status).toBe(400)
    expect((err as KbApiError).message).toContain('agent not found')
  })

  it('re-resolves the API key per call (credential hot-swap contract)', async () => {
    const resolveApiKey = vi.fn(async () => 'sk-test')
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const client = new KbClient({
      resolveWorkspaceId: async () => 'ws-1',
      endpointHost: 'h',
      resolveApiKey,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await client.postJson('/p', {})
    await client.postJson('/p', {})
    expect(resolveApiKey).toHaveBeenCalledTimes(2)
  })

  it('re-resolves the workspace id per call (credential hot-swap contract)', async () => {
    let workspaceId = 'ws-1'
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const client = new KbClient({
      resolveWorkspaceId: async () => workspaceId,
      endpointHost: 'h',
      resolveApiKey: async () => 'sk-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await client.postJson('/p', {})
    workspaceId = 'ws-2'
    await client.postJson('/p', {})
    const urls = fetchImpl.mock.calls.map(call => (call as unknown as [string])[0])
    expect(urls).toEqual(['https://ws-1.h/p', 'https://ws-2.h/p'])
  })
})
