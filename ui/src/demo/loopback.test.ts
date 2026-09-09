/**
 * The loopback answers the prose handshake the way the server does, seeds a
 * note from its column, keeps what one channel wrote for the next, and hands
 * it back after a reload.
 *
 * The store is a map here: jsdom has no IndexedDB, and what this holds is the
 * socket's half, not the database's. Time is faked, since a save follows the
 * last update by a pause.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { base64 } from '@/api/proseSync'

const kept = new Map<string, string>()
const writes: string[] = []
vi.mock('./store', () => ({
  loadProse: (field: string) => Promise.resolve(kept.get(field) ?? null),
  saveProse: (field: string, encoded: string) => {
    kept.set(field, encoded)
    writes.push(field)
    return Promise.resolve()
  },
}))

import { LoopbackSocket, forgetProse, seedLoopback, textOf } from './loopback'

const FIELD = 'reports:r1:document:block-1'
const NOTE = 'casenotes:n1:document'

/** A client document, joined to a socket the way the prose channel joins one. */
async function join(
  socket: LoopbackSocket,
  field = FIELD,
): Promise<{ doc: Y.Doc; answered: number }> {
  const doc = new Y.Doc({ gc: false })
  let answered = 0
  socket.onmessage = (event) => {
    const frame = JSON.parse(event.data) as { type: string; field: string; update: string }
    if (frame.type !== 'prose.sync' || frame.field !== field) return
    answered += 1
    const bytes = base64.decode(frame.update)
    if (!bytes) return
    readSyncMessage(decoding.createDecoder(bytes), encoding.createEncoder(), doc, 'remote')
  }
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return
    const encoder = encoding.createEncoder()
    writeUpdate(encoder, update)
    socket.send(
      JSON.stringify({
        type: 'prose.sync',
        field,
        update: base64.encode(encoding.toUint8Array(encoder)),
      }),
    )
  })
  const hello = encoding.createEncoder()
  writeSyncStep1(hello, doc)
  socket.send(
    JSON.stringify({
      type: 'prose.sync',
      field,
      update: base64.encode(encoding.toUint8Array(hello)),
    }),
  )
  await settle()
  return { doc, answered }
}

/** Enough microtask hops for the store's promise and the answer's. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

/** A paragraph of text into the note fragment, as the editor writes one. */
function write(doc: Y.Doc, text: string): void {
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  doc.getXmlFragment('note').insert(0, [paragraph])
}

beforeEach(() => {
  vi.useFakeTimers()
  kept.clear()
  writes.length = 0
  seedLoopback({})
  forgetProse()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the loopback socket', () => {
  it('is open from construction, says so on the next tick, and answers a step 1', async () => {
    const socket = new LoopbackSocket('ws://demo.invalid/api/cases/x/live')
    expect(socket.readyState).toBe(1)
    let opened = false
    socket.onopen = () => {
      opened = true
    }
    const { answered } = await join(socket)
    expect(opened).toBe(true)
    expect(answered).toBe(1)
  })

  it('hands what one channel wrote to the next, after one write a pause later', async () => {
    const first = await join(new LoopbackSocket('ws://demo.invalid/live'))
    write(first.doc, 'Probe prose.')
    write(first.doc, 'A second paragraph.')
    await settle()
    expect(writes).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(writes).toEqual([FIELD])

    const second = await join(new LoopbackSocket('ws://demo.invalid/live'))
    expect(textOf(second.doc)).toBe('A second paragraph.\nProbe prose.')
  })

  it('keeps one document per field', async () => {
    const one = await join(new LoopbackSocket('ws://demo.invalid/live'), 'reports:r1:document:a')
    write(one.doc, 'Only in a.')
    await settle()
    const other = await join(new LoopbackSocket('ws://demo.invalid/live'), 'reports:r1:document:b')
    expect(textOf(other.doc)).toBe('')
  })

  it('restores the store after a reload, and forgets it on a reset', async () => {
    const before = await join(new LoopbackSocket('ws://demo.invalid/live'))
    write(before.doc, 'Kept.')
    await vi.advanceTimersByTimeAsync(500)

    forgetProse()
    const after = await join(new LoopbackSocket('ws://demo.invalid/live'))
    expect(textOf(after.doc)).toBe('Kept.')

    forgetProse()
    kept.clear()
    const fresh = await join(new LoopbackSocket('ws://demo.invalid/live'))
    expect(textOf(fresh.doc)).toBe('')
  })

  it('seeds a note from its column and tells the column what was typed', async () => {
    const told: string[] = []
    seedLoopback({
      seedOf: (field) => (field === NOTE ? 'First line.\nSecond line.' : null),
      onText: (field, text) => {
        if (field === NOTE) told.push(text)
      },
    })
    const note = await join(new LoopbackSocket('ws://demo.invalid/live'), NOTE)
    expect(textOf(note.doc)).toBe('First line.\nSecond line.')

    write(note.doc, 'Typed.')
    await settle()
    expect(told.at(-1)).toBe('Typed.\nFirst line.\nSecond line.')
  })

  it('answers nothing that is not the prose handshake', async () => {
    const socket = new LoopbackSocket('ws://demo.invalid/live')
    let frames = 0
    socket.onmessage = () => {
      frames += 1
    }
    socket.send(JSON.stringify({ type: 'claim', table: 'systems', id: 'x' }))
    socket.send('not json')
    await settle()
    expect(frames).toBe(0)
  })
})
