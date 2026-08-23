import { describe, expect, it } from 'vitest'
import { CATALOG_ENTRY_LIMIT, buildServiceCatalog } from '../src/service-catalog.js'
import type { ServiceEntry } from '../src/services.js'

function entry(overrides: Partial<ServiceEntry> & { agent_id: string }): ServiceEntry {
  return {
    agent_name: `name-${overrides.agent_id}`,
    scene: 'search',
    status: 'deployed',
    ...overrides,
  }
}

function catalog(entries: ServiceEntry[], extra: Partial<Parameters<typeof buildServiceCatalog>[0]> = {}) {
  return buildServiceCatalog({ entries, total: entries.length, truncated: false, ...extra })
}

describe('buildServiceCatalog', () => {
  it('returns undefined when there is nothing worth injecting', () => {
    // No services at all: the tool descriptions alone keep the tools usable.
    expect(catalog([])).toBeUndefined()
  })

  it('lists every service when the count is within the limit', () => {
    const text = catalog([
      entry({ agent_id: 'aid-1', agent_name: 'RAG学习-检索' }),
      entry({ agent_id: 'aid-2', agent_name: '产品文档' }),
    ])
    expect(text).toContain('aid-1 — RAG学习-检索')
    expect(text).toContain('aid-2 — 产品文档')
    // Nothing was cut, so nothing should claim otherwise.
    expect(text).not.toContain('showing')
  })

  it('omits a scene with no services entirely', () => {
    const text = catalog([entry({ agent_id: 'aid-1' })])
    expect(text).toContain('kb_search')
    // "no chat services" is noise that invites handling a case that does not exist.
    expect(text).not.toContain('kb_chat')
    expect(text).not.toMatch(/no chat/i)
  })

  it('renders both scenes without mixing their services', () => {
    const text = catalog([
      entry({ agent_id: 'aid-s', scene: 'search' }),
      entry({ agent_id: 'aid-c', scene: 'chat' }),
    ]) ?? ''
    const searchAt = text.indexOf('kb_search')
    const chatAt = text.indexOf('kb_chat')
    expect(searchAt).toBeGreaterThanOrEqual(0)
    expect(chatAt).toBeGreaterThan(searchAt)
    // Each id belongs to its own section.
    expect(text.indexOf('aid-s')).toBeLessThan(chatAt)
    expect(text.indexOf('aid-c')).toBeGreaterThan(chatAt)
  })

  it('shows only the configured default and says how many others exist', () => {
    const entries = Array.from({ length: 5 }, (_x, i) => entry({ agent_id: `aid-${i}` }))
    const text = catalog(entries, { defaultRetrieveAgentId: 'aid-3' }) ?? ''
    expect(text).toContain('aid-3')
    expect(text).not.toContain('aid-0')
    expect(text).toContain('4 others exist')
  })

  it('falls back to the full list when the configured default is not in the cache', () => {
    // A stale or mistyped default must not hide the services that do exist.
    const text = catalog([entry({ agent_id: 'aid-1' })], { defaultRetrieveAgentId: 'aid-gone' }) ?? ''
    expect(text).toContain('aid-1')
    expect(text).not.toContain('default service')
  })

  it('caps the list at the limit, newest first, and states the shortfall', () => {
    const entries = Array.from({ length: 14 }, (_x, i) => entry({
      agent_id: `aid-${i}`,
      // aid-13 newest, aid-0 oldest.
      modify_time: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00`,
    }))
    const text = catalog(entries) ?? ''
    expect(text).toContain('aid-13')
    // The four oldest fall outside the window.
    expect(text).not.toContain('aid-0 ')
    expect(text).toContain(`showing ${CATALOG_ENTRY_LIMIT} most recently modified of 14`)
    // Silent truncation would make the model treat the list as complete.
    expect(text).toContain('--name <keyword>')
  })

  it('marks a capped fetch as a lower bound rather than an exact total', () => {
    // The fetch itself stopped early, so even the count is unknown.
    const entries = Array.from({ length: 12 }, (_x, i) => entry({ agent_id: `aid-${i}` }))
    const text = catalog(entries, { truncated: true, total: 900 }) ?? ''
    expect(text).toContain('more than')
  })

  it('states that agent_id is required and forbids guessing one', () => {
    const text = catalog([entry({ agent_id: 'aid-1' })]) ?? ''
    expect(text).toContain('required')
    // Picking the closest-looking service returns unrelated evidence, which is
    // worse for the user than an honest "no such knowledge base".
    expect(text).toMatch(/say so plainly/i)
  })

  it('labels an unnamed service instead of rendering a bare dash', () => {
    const text = catalog([entry({ agent_id: 'aid-1', agent_name: '' })]) ?? ''
    expect(text).toContain('(unnamed)')
  })

  it('renders a description when one arrives, truncated to its budget', () => {
    // Forward compatibility: the backend has not shipped this field yet.
    const long = 'x'.repeat(250)
    const text = catalog([entry({ agent_id: 'aid-1', description: long })]) ?? ''
    expect(text).toContain('x'.repeat(199))
    expect(text).not.toContain('x'.repeat(201))
    expect(text).toContain('…')
  })
})
