import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KbClient } from '../src/client.js'
import { ServiceCache, serviceCachePath, writeServiceCache } from '../src/service-cache.js'
import { installServiceContext } from '../src/service-context.js'

const HOST = 'cn-beijing.maas.aliyuncs.com'
const WS = 'llm-a'
const SOURCE_PLUGIN = 'tool-bailian-kb/services'

type Injected = { id: string; source: { plugin?: string }; content: { text?: string }[] }
type Decision = { kind: string; messages: Injected[] }

interface HarnessOptions {
  entries?: { agent_id: string; agent_name: string; scene: 'search' | 'chat'; status: string }[]
  cacheOverride?: ServiceCache
  postJson?: () => Promise<unknown>
}

/** Drives the installed `agent/pre-step` listener against a fake session. */
function harness(options: HarnessOptions = {}) {
  const home = mkdtempSync(join(tmpdir(), 'bailian-kb-ctx-'))
  const entries = options.entries ?? [
    { agent_id: 'aid-1', agent_name: 'svc-one', scene: 'search' as const, status: 'deployed' },
  ]
  writeServiceCache(serviceCachePath(WS, home), {
    version: 1,
    fetchedAt: Date.now(),
    workspaceId: WS,
    endpointHost: HOST,
    entries,
    total: entries.length,
    truncated: false,
  })
  const postJson = vi.fn(options.postJson ?? (async () => ({ code: 'Success', data: { total_count: 0, rows: [] } })))
  const cache = options.cacheOverride ?? new ServiceCache({
    client: { postJson } as unknown as KbClient,
    resolveWorkspaceId: async () => WS,
    endpointHost: HOST,
    warn: () => {},
    home,
  })

  let listener!: (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>
  const warn = vi.fn()
  const ctx = { on: (_event: string, handler: typeof listener) => { listener = handler } }
  installServiceContext(ctx as never, {
    cache,
    resolveWorkspaceId: async () => WS,
    resolveDefaultRetrieveAgentId: async () => undefined,
    resolveDefaultChatAgentId: async () => undefined,
    warn,
  })

  const events: { type: string; seq: number; data: unknown }[] = []
  const agent = {
    session: {
      events,
      surface: { nodes: [] as number[] },
      header: { cwd: '/tmp' },
    },
  }

  const run = async (proposed: Injected[], downstream: 'enter' | 'reject'): Promise<Decision> =>
    await listener(
      { agent, signal: { aborted: false, throwIfAborted: () => {} } },
      async () => downstream === 'reject' ? { kind: 'reject' } : { kind: 'enter', messages: proposed },
    ) as Decision

  return {
    cache,
    warn,
    postJson,
    /** One step whose downstream decision enters with `proposed`. */
    step: async (proposed: Injected[] = []) => await run(proposed, 'enter'),
    /** One step whose downstream decision rejects. */
    stepRejecting: async () => await run([], 'reject'),
    /** Record an entered message into the durable log and make it visible. */
    commit: (message: Injected) => {
      events.push({ type: 'user/message', seq: events.length + 1, data: message })
      agent.session.surface.nodes = events.map(event => event.seq)
    },
    /** Simulate compaction: the events remain, the surface shrinks. */
    setSurface: (seqs: number[]) => { agent.session.surface.nodes = seqs },
    /** This module's own messages within a decision. */
    injected: (decision: Decision) => decision.messages.filter(m => m.source.plugin === SOURCE_PLUGIN),
  }
}

describe('installServiceContext', () => {
  it('injects the catalog as a sourced message on the first step', async () => {
    const h = harness()
    const decision = await h.step()
    expect(decision.kind).toBe('enter')
    const own = h.injected(decision)
    expect(own).toHaveLength(1)
    expect(own[0]?.content[0]?.text).toContain('aid-1')
  })

  it('does not re-inject on later steps of the same turn', async () => {
    // pre-step fires once per model request, so a turn with five tool calls
    // fires it six times. Re-injecting each time would insert six copies and
    // void the KV cache from the first insertion onward — this is a correctness
    // guard, not an optimization.
    const h = harness()
    const first = await h.step()
    const own = h.injected(first)
    expect(own).toHaveLength(1)
    h.commit(own[0]!)

    for (let toolRoundTrip = 0; toolRoundTrip < 5; toolRoundTrip += 1) {
      expect(h.injected(await h.step())).toHaveLength(0)
    }
  })

  it('re-injects once compaction drops the catalog from the visible surface', async () => {
    const h = harness()
    const first = await h.step()
    h.commit(h.injected(first)[0]!)
    expect(h.injected(await h.step())).toHaveLength(0)

    // The event stays in the durable log but leaves the surface. Comparing only
    // "did we ever publish this" would suppress every future injection and the
    // model would finish the session with no service list at all.
    h.setSurface([])
    expect(h.injected(await h.step())).toHaveLength(1)
  })

  it('replaces its own pending message instead of adding a second one', async () => {
    const h = harness()
    const pending = h.injected(await h.step())[0]!
    const second = await h.step([pending])
    expect(h.injected(second)).toHaveLength(1)
  })

  it('injects nothing when the cache holds no services', async () => {
    const h = harness({ entries: [] })
    expect(h.injected(await h.step())).toHaveLength(0)
  })

  it('never awaits the network refresh', async () => {
    // A slow list request must not delay the user's request.
    let settle: ((value: unknown) => void) | undefined
    const h = harness({ postJson: async () => await new Promise(resolve => { settle = resolve }) })
    // Force staleness so this step schedules a refresh.
    h.cache.invalidate()
    const raced = await Promise.race([
      h.step().then(() => 'stepped'),
      new Promise(resolve => { setTimeout(() => resolve('timed out'), 200) }),
    ])
    expect(raced).toBe('stepped')
    settle?.({ data: { rows: [] } })
  })

  it('degrades to no injection when anything throws, never failing the step', async () => {
    // A throwing pre-step listener fails the proposed step, i.e. stalls the
    // user's turn. A missing catalog is far cheaper than that.
    const exploding = {
      isStale: () => { throw new Error('corrupt cache') },
      peek: () => undefined,
      refresh: async () => {},
      invalidate: () => {},
    } as unknown as ServiceCache
    const h = harness({ cacheOverride: exploding })
    const decision = await h.step()
    expect(decision.kind).toBe('enter')
    expect(h.injected(decision)).toHaveLength(0)
    expect(h.warn).toHaveBeenCalled()
  })

  it('passes a rejected downstream decision straight through', async () => {
    const h = harness()
    expect((await h.stepRejecting()).kind).toBe('reject')
  })
})
