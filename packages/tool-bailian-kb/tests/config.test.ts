import { describe, expect, it } from 'vitest'
import { Config } from '../src/index.js'

describe('Config', () => {
  it('applies defaults and keeps required workspaceId', () => {
    const resolved = new Config({ workspaceId: 'ws-1' })
    expect(resolved.workspaceId).toBe('ws-1')
    expect(resolved.endpointHost).toBe('cn-beijing.maas.aliyuncs.com')
    expect(resolved.chatTimeoutMs).toBe(300_000)
    expect(resolved.defaultAgentId).toBeUndefined()
  })

  it('rejects a missing workspaceId (fail loud at load)', () => {
    expect(() => new Config({} as never)).toThrow()
  })
})
