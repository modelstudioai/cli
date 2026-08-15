import { describe, expect, it, vi } from 'vitest'
import type { ServiceListResponse } from '../src/api-types.js'
import type { KbClient } from '../src/client.js'
import { listServices } from '../src/services.js'

function fakeClient(byScene: Record<string, ServiceListResponse>) {
  const postJson = vi.fn(async (_path: string, body: { agent_scene: string }) => byScene[body.agent_scene])
  return { client: { postJson } as unknown as KbClient, postJson }
}

const row = (id: string, scene: string) => ({
  agent_id: id, agent_name: `svc-${id}`, agent_scene: scene, agent_status: 'deployed',
  pipeline_list: [{ pipeline_id: 'p1', pipeline_name: 'kb-one' }],
})

describe('listServices', () => {
  it('queries both scenes when scene is omitted and merges rows with scene tags', async () => {
    const { client, postJson } = fakeClient({
      chat: { data: { total_count: 1, rows: [row('a', 'chat')] } },
      search: { data: { total_count: 1, rows: [row('b', 'search')] } },
    })
    const out = await listServices(client, {})
    expect(postJson).toHaveBeenCalledTimes(2)
    expect(out.services.map(s => [s.agent_id, s.scene])).toEqual([['a', 'chat'], ['b', 'search']])
    expect(out.services[0]!.knowledge_bases).toEqual(['kb-one'])
    expect(out.total).toBe(2)
    expect(out.truncated).toBe(false)
    const body = postJson.mock.calls[0]![1] as unknown as Record<string, unknown>
    expect(body.page_number).toBe(1)
    expect(body.page_size).toBe(100)
  })

  it('queries one scene and forwards the name filter', async () => {
    const { client, postJson } = fakeClient({ search: { data: { total_count: 0, rows: [] } } })
    await listServices(client, { scene: 'search', nameFilter: '客服' })
    expect(postJson).toHaveBeenCalledTimes(1)
    expect((postJson.mock.calls[0]![1] as unknown as Record<string, unknown>).agent_name).toBe('客服')
  })

  it('flags truncation when a scene exceeds one max page', async () => {
    const { client } = fakeClient({
      chat: { data: { total_count: 250, rows: [row('a', 'chat')] } },
      search: { data: { total_count: 0, rows: [] } },
    })
    const out = await listServices(client, {})
    expect(out.truncated).toBe(true)
    expect(out.total).toBe(250)
  })
})
