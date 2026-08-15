import { describe, expect, it } from 'vitest'
import { KB_PATHS, kbEndpoint } from '../src/endpoints.js'

describe('kbEndpoint', () => {
  it('builds the workspace-subdomain URL', () => {
    expect(kbEndpoint('cn-beijing.maas.aliyuncs.com', 'ws-1', KB_PATHS.search))
      .toBe('https://ws-1.cn-beijing.maas.aliyuncs.com/api/v1/indices/knowledge/search')
  })

  it('keeps protocol paths as constants', () => {
    expect(KB_PATHS.chat).toBe('/api/v2/apps/knowledge/chat')
    expect(KB_PATHS.serviceList).toBe('/api/v1/indices/rag/app/list')
  })
})
