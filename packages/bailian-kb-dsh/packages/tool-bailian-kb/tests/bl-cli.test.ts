import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBlCliConfig } from '../src/bl-cli.js'

const dir = mkdtempSync(join(tmpdir(), 'bl-cli-test-'))

function fileWith(name: string, content: string): string {
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

describe('readBlCliConfig', () => {
  it('reads api_key and workspace_id from the default profile (top level)', () => {
    const path = fileWith('full.json', JSON.stringify({
      api_key: 'sk-abc',
      workspace_id: 'ws-1',
      output: 'text',
      timeout: 600,
    }))
    expect(readBlCliConfig(path)).toEqual({ apiKey: 'sk-abc', workspaceId: 'ws-1' })
  })

  it('omits absent, blank, and non-string fields instead of returning empties', () => {
    const path = fileWith('partial.json', JSON.stringify({
      api_key: '  ',
      workspace_id: 42,
    }))
    expect(readBlCliConfig(path)).toEqual({})
    const keyOnly = fileWith('key-only.json', JSON.stringify({ api_key: 'sk-abc' }))
    expect(readBlCliConfig(keyOnly)).toEqual({ apiKey: 'sk-abc' })
  })

  it('reads a missing, malformed, or non-object file as empty', () => {
    expect(readBlCliConfig(join(dir, 'nope.json'))).toEqual({})
    expect(readBlCliConfig(fileWith('broken.json', '{oops'))).toEqual({})
    expect(readBlCliConfig(fileWith('array.json', '["sk-abc"]'))).toEqual({})
  })
})
