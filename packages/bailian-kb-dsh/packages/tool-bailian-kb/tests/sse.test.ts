import { describe, expect, it } from 'vitest'
import { parseSseStream } from '../src/sse.js'

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new Response(text).body as ReadableStream<Uint8Array>
}

async function collect(text: string) {
  const events: { event?: string; data: string }[] = []
  for await (const e of parseSseStream(streamOf(text))) events.push(e)
  return events
}

describe('parseSseStream', () => {
  it('yields data events split on blank lines', async () => {
    const events = await collect('data: {"a":1}\n\ndata: [DONE]\n\n')
    expect(events).toEqual([{ event: undefined, data: '{"a":1}' }, { event: undefined, data: '[DONE]' }])
  })

  it('carries the event field and parses CRLF lines', async () => {
    const events = await collect('event: error\r\ndata: {"message":"boom"}\r\n\r\n')
    expect(events[0]).toEqual({ event: 'error', data: '{"message":"boom"}' })
  })

  it('flushes a final event not terminated by a blank line', async () => {
    const events = await collect('data: tail\n')
    expect(events).toEqual([{ event: undefined, data: 'tail' }])
  })
})
