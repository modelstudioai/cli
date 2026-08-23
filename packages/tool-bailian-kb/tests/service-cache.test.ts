import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { KbClient } from '../src/client.js'
import {
  CACHE_TTL_MS,
  EMPTY_CACHE_TTL_MS,
  ServiceCache,
  readServiceCache,
  serviceCachePath,
  writeServiceCache,
  type ServiceCacheDocument,
} from '../src/service-cache.js'

const HOST = 'cn-beijing.maas.aliyuncs.com'

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'bailian-kb-cache-'))
}

function doc(overrides: Partial<ServiceCacheDocument> = {}): ServiceCacheDocument {
  return {
    version: 1,
    fetchedAt: 1_000,
    workspaceId: 'llm-a',
    endpointHost: HOST,
    entries: [{ agent_id: 'aid-1', agent_name: 'svc', scene: 'search', status: 'deployed' }],
    total: 1,
    truncated: false,
    ...overrides,
  }
}

/** Write raw text to the cache path, bypassing the writer's validation. */
function seedRaw(home: string, workspaceId: string, text: string): string {
  const path = serviceCachePath(workspaceId, home)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  return path
}

describe('serviceCachePath', () => {
  it('separates workspaces by filename', () => {
    // An api key only reaches its own workspace, so one shared file would blend accounts.
    expect(serviceCachePath('llm-a', '/home')).toBe('/home/cache/bailian-kb/services-llm-a.json')
    expect(serviceCachePath('llm-b', '/home')).not.toBe(serviceCachePath('llm-a', '/home'))
  })
})

describe('readServiceCache', () => {
  it('round-trips a document written by writeServiceCache', () => {
    const home = tempHome()
    const path = serviceCachePath('llm-a', home)
    writeServiceCache(path, doc())
    expect(readServiceCache(path, 'llm-a', HOST)).toEqual(doc())
  })

  it('reads every unusable file as a miss instead of throwing', () => {
    const home = tempHome()
    // Absent.
    expect(readServiceCache(serviceCachePath('nope', home), 'nope', HOST)).toBeUndefined()
    // Malformed JSON.
    expect(readServiceCache(seedRaw(home, 'a', '{oops'), 'a', HOST)).toBeUndefined()
    // Non-object roots.
    expect(readServiceCache(seedRaw(home, 'b', '["x"]'), 'b', HOST)).toBeUndefined()
    // Newer or older schema: treated as a miss, never migrated.
    expect(readServiceCache(seedRaw(home, 'c', JSON.stringify(doc({ version: 2 }))), 'c', HOST)).toBeUndefined()
    // Required fields of the wrong type.
    expect(readServiceCache(seedRaw(home, 'd', JSON.stringify(doc({ fetchedAt: 'soon' as never }))), 'd', HOST))
      .toBeUndefined()
  })

  it('refuses a document belonging to another workspace or host', () => {
    const home = tempHome()
    const path = seedRaw(home, 'llm-a', JSON.stringify(doc({ workspaceId: 'llm-other' })))
    expect(readServiceCache(path, 'llm-a', HOST)).toBeUndefined()
    const hostPath = seedRaw(home, 'llm-b', JSON.stringify(doc({ workspaceId: 'llm-b', endpointHost: 'other.host' })))
    expect(readServiceCache(hostPath, 'llm-b', HOST)).toBeUndefined()
  })
})

describe('writeServiceCache', () => {
  it('publishes atomically and leaves no temp file behind', () => {
    const home = tempHome()
    const path = serviceCachePath('llm-a', home)
    writeServiceCache(path, doc())
    const names = readdirSync(dirname(path))
    expect(names).toEqual(['services-llm-a.json'])
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(doc())
  })

  it('creates the cache directory owner-only', () => {
    const home = tempHome()
    const path = serviceCachePath('llm-a', home)
    writeServiceCache(path, doc())
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700)
  })
})

/** A cache wired to a client returning one page per scene. */
function cacheWith(home: string, onPost: () => Promise<unknown>, now: () => number = () => 5_000) {
  const warn = vi.fn()
  const postJson = vi.fn(onPost)
  const cache = new ServiceCache({
    client: { postJson } as unknown as KbClient,
    resolveWorkspaceId: async () => 'llm-a',
    endpointHost: HOST,
    warn,
    home,
    now,
  })
  return { cache, warn, postJson }
}

describe('ServiceCache', () => {
  const emptyPage = { code: 'Success', data: { total_count: 0, rows: [] } }

  it('treats a missing document as stale and a fresh one as current', () => {
    const home = tempHome()
    const { cache } = cacheWith(home, async () => emptyPage)
    expect(cache.isStale('llm-a')).toBe(true)

    writeServiceCache(serviceCachePath('llm-a', home), doc({ fetchedAt: 5_000 }))
    cache.invalidate()
    expect(cache.isStale('llm-a')).toBe(false)
  })

  it('goes stale once the TTL elapses', () => {
    const home = tempHome()
    writeServiceCache(serviceCachePath('llm-a', home), doc({ fetchedAt: 0 }))
    const { cache } = cacheWith(home, async () => emptyPage, () => CACHE_TTL_MS)
    expect(cache.isStale('llm-a')).toBe(true)
  })

  it('expires an EMPTY list on the much shorter negative TTL', () => {
    // The trap this closes: configure the plugin against a fresh workspace (0
    // services) → create a service → and then wait out the full TTL before the
    // catalog appears. An empty list is a setup-in-progress state, not a fact.
    const home = tempHome()
    writeServiceCache(serviceCachePath('llm-a', home), doc({ fetchedAt: 0, entries: [], total: 0 }))
    const justAfterEmptyTtl = cacheWith(home, async () => emptyPage, () => EMPTY_CACHE_TTL_MS)
    expect(justAfterEmptyTtl.cache.isStale('llm-a')).toBe(true)

    // A non-empty list of the same age is still fresh, so the short window costs
    // nothing once services exist.
    writeServiceCache(serviceCachePath('llm-b', home), doc({ workspaceId: 'llm-b', fetchedAt: 0 }))
    const nonEmpty = cacheWith(home, async () => emptyPage, () => EMPTY_CACHE_TTL_MS)
    expect(nonEmpty.cache.isStale('llm-b')).toBe(false)
    expect(EMPTY_CACHE_TTL_MS).toBeLessThan(CACHE_TTL_MS)
  })

  it('reports a panel snapshot that separates "empty workspace" from "stale list"', () => {
    const home = tempHome()
    const { cache } = cacheWith(home, async () => emptyPage, () => 5_000)
    // Nothing cached at all: the panel must be able to say "never fetched"
    // rather than showing a zero that reads as "the workspace is empty".
    const empty = cache.status('llm-a')
    expect(empty).not.toHaveProperty('fetchedAt')
    expect(empty).toMatchObject({ searchCount: 0, chatCount: 0, stale: true })

    writeServiceCache(serviceCachePath('llm-a', home), doc({
      fetchedAt: 5_000,
      entries: [
        { agent_id: 'aid-1', agent_name: 'a', scene: 'search', status: 'deployed', modify_time: '2026-08-01' },
        { agent_id: 'aid-2', agent_name: 'b', scene: 'search', status: 'deployed', modify_time: '2026-08-09' },
        { agent_id: 'aid-3', agent_name: 'c', scene: 'chat', status: 'deployed' },
      ],
      total: 900,
      truncated: true,
    }))
    cache.invalidate()
    expect(cache.status('llm-a')).toMatchObject({
      fetchedAt: 5_000,
      searchCount: 2,
      chatCount: 1,
      total: 900,
      truncated: true,
      stale: false,
    })
    // The picker lists newest first so the likely-in-use service is on top.
    expect(cache.entriesFor('llm-a', 'search').map(e => e.agent_id)).toEqual(['aid-2', 'aid-1'])
    expect(cache.entriesFor('llm-a', 'chat').map(e => e.agent_id)).toEqual(['aid-3'])
  })

  it('re-reads from disk when the workspace changes', () => {
    const home = tempHome()
    writeServiceCache(serviceCachePath('llm-a', home), doc({ fetchedAt: 5_000 }))
    const { cache } = cacheWith(home, async () => emptyPage)
    expect(cache.peek('llm-a')?.workspaceId).toBe('llm-a')
    // Switching accounts must not keep serving the previous workspace's list.
    expect(cache.peek('llm-b')).toBeUndefined()
  })

  it('shares one in-flight request across concurrent refreshes', async () => {
    const home = tempHome()
    // pre-step runs on every model request, so an unguarded refresh would pile up.
    const { cache, postJson } = cacheWith(home, async () => emptyPage)
    await Promise.all([cache.refresh(), cache.refresh(), cache.refresh()])
    // Two calls total: one per scene, from a single shared refresh.
    expect(postJson).toHaveBeenCalledTimes(2)
  })

  it('stores a fetched list and serves it synchronously afterwards', async () => {
    const home = tempHome()
    const { cache } = cacheWith(home, async () => ({
      code: 'Success',
      data: { total_count: 1, rows: [{ agent_id: 'aid-9', agent_name: 'svc', agent_status: 'deployed' }] },
    }))
    await cache.refresh()
    const stored = cache.peek('llm-a')
    expect(stored?.entries.map(e => e.agent_id)).toEqual(['aid-9', 'aid-9']) // one per scene
    expect(stored?.fetchedAt).toBe(5_000)
    // And it survives as a file for the next process.
    expect(readServiceCache(serviceCachePath('llm-a', home), 'llm-a', HOST)).toEqual(stored)
  })

  it('never rejects on failure and keeps the previous document', async () => {
    const home = tempHome()
    writeServiceCache(serviceCachePath('llm-a', home), doc({ fetchedAt: 5_000 }))
    const { cache, warn } = cacheWith(home, async () => {
      throw new Error('network down')
    })
    expect(cache.peek('llm-a')?.entries).toHaveLength(1)
    await expect(cache.refresh()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    // The stale-but-usable list is still there.
    expect(cache.peek('llm-a')?.entries).toHaveLength(1)
  })

  it('does not reject when the workspace is not configured yet', async () => {
    const home = tempHome()
    const warn = vi.fn()
    const cache = new ServiceCache({
      client: { postJson: vi.fn() } as unknown as KbClient,
      resolveWorkspaceId: async () => {
        throw new Error('workspace id is not configured')
      },
      endpointHost: HOST,
      warn,
      home,
    })
    await expect(cache.refresh()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('refresh failed'))
  })
})
