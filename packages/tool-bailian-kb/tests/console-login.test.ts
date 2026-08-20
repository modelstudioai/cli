import { describe, expect, it } from 'vitest'
import { consoleLoginState, parseCallbackBody, pickCallbackCredentials } from '../src/console-login.js'

describe('parseCallbackBody', () => {
  it('reads a plain JSON callback', () => {
    expect(parseCallbackBody('{"api_key":"sk-abc","workspace_id":"ws-1"}'))
      .toMatchObject({ api_key: 'sk-abc', workspace_id: 'ws-1' })
  })

  it('flattens a `data` envelope, the top level winning', () => {
    const parsed = parseCallbackBody('{"data":{"api_key":"sk-inner","workspace_id":"ws-1"},"api_key":"sk-outer"}')
    expect(parsed).toMatchObject({ api_key: 'sk-outer', workspace_id: 'ws-1' })
  })

  it('reads a form-encoded callback', () => {
    expect(parseCallbackBody('api_key=sk-abc&workspace_id=ws-1'))
      .toMatchObject({ api_key: 'sk-abc', workspace_id: 'ws-1' })
  })

  it('tolerates a BOM, surrounding space, and an empty or broken body', () => {
    expect(parseCallbackBody('\uFEFF  {"api_key":"sk-abc"}  ')).toMatchObject({ api_key: 'sk-abc' })
    expect(parseCallbackBody('')).toEqual({})
    expect(parseCallbackBody('   ')).toEqual({})
    // A non-object JSON value carries no fields, and neither does an array.
    expect(parseCallbackBody('["sk-abc"]')).toEqual({})
  })
})

describe('pickCallbackCredentials', () => {
  it('accepts both snake_case and camelCase field names', () => {
    expect(pickCallbackCredentials({}, { apiKey: 'sk-abc', workspaceId: 'ws-1' }))
      .toEqual({ apiKey: 'sk-abc', workspaceId: 'ws-1' })
    expect(pickCallbackCredentials({}, { api_key: 'sk-abc', workspace_id: 'ws-1' }))
      .toEqual({ apiKey: 'sk-abc', workspaceId: 'ws-1' })
  })

  it('lets query parameters win over the body', () => {
    expect(pickCallbackCredentials({ api_key: 'sk-query' }, { api_key: 'sk-body' }))
      .toEqual({ apiKey: 'sk-query' })
  })

  it('omits absent, blank, and non-string fields instead of returning empties', () => {
    expect(pickCallbackCredentials({}, {})).toEqual({})
    expect(pickCallbackCredentials({}, { api_key: '   ', workspace_id: 42 })).toEqual({})
    expect(pickCallbackCredentials({}, { api_key: ' sk-abc ' })).toEqual({ apiKey: 'sk-abc' })
  })
})

describe('consoleLoginState', () => {
  it('starts idle, carrying no secret', () => {
    expect(consoleLoginState()).toEqual({ phase: 'idle' })
  })
})
