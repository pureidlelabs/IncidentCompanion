/**
 * The loopback answers the prose handshake the way the server does, keeps
 * what one channel wrote for the next, and hands it back after a reload.
 *
 * The store is a map here: jsdom has no IndexedDB, and what this holds is the
 * socket's half, not the database's.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { base64 } from '@/api/proseSync'

const kept = new Map<string, string>()
vi.mock('./store', () => ({
  loadProse: (field: string) => Promise.resolve(kept.get(field) ?? null),
  saveProse: (field: string, encoded: string) => {
    kept.set(field, encoded)
    return Promise.resolve()
  },
}))

import { LoopbackSocket, forgetProse } from './loopback'

const FIELD = 'block-1'

/** A client document, joined to a socket the way the prose channel joins one. */
async function join(socket: LoopbackSocket): Promise<{ doc: Y.Doc; answered: number }> {
  const doc = new Y.Doc()
  let answered = 0
  socket.onmessage = (event) => {
    const frame = JSON.parse(event.data) as { type: string; field: string; update: string }
    if (frame.type !== 'prose.sync' || frame.field !== FIELD) return
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
        field: FIELD,
        update: base64.encode(encoding.toUint8Array(encoder)),
      }),
    )
  })
  const hello = encoding.createEncoder()
  writeSyncStep1(hello, doc)
  socket.send(
    JSON.stringify({
      type: 'prose.sync',
      field: FIELD,
      update: base64.encode(encoding.toUint8Array(hello)),
    }),
  )
  await settle()
  return { doc, answered }
}

/** Two microtask hops: the store's promise, then the answer's. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

beforeEach(() => {
  kept.clear()
  forgetProse()
})

describe('the loopback socket', () => {
  it('opens on the next tick and answers a step 1 with a step 2', async () => {
    const socket = new LoopbackSocket('ws://demo.invalid/api/cases/x/live')
    let opened = false
    socket.onopen = () => {
      opened = true
    }
    const { answered } = await join(socket)
    expect(opened).toBe(true)
    expect(answered).toBe(1)
  })

  it('hands what one channel wrote to the next, and keeps it for the store', async () => {
    const first = await join(new LoopbackSocket('ws://demo.invalid/live'))
    first.doc.getText('body').insert(0, 'Probe prose.')
    await settle()

    const second = await join(new LoopbackSocket('ws://demo.invalid/live'))
    expect(second.doc.getText('body').toJSON()).toBe('Probe prose.')
    expect(kept.get(FIELD)).toBeTypeOf('string')
  })

  it('restores the store after a reload, and forgets it on a reset', async () => {
    const before = await join(new LoopbackSocket('ws://demo.invalid/live'))
    before.doc.getText('body').insert(0, 'Kept.')
    await settle()

    forgetProse()
    const after = await join(new LoopbackSocket('ws://demo.invalid/live'))
    expect(after.doc.getText('body').toJSON()).toBe('Kept.')

    forgetProse()
    kept.clear()
    const fresh = await join(new LoopbackSocket('ws://demo.invalid/live'))
    expect(fresh.doc.getText('body').toJSON()).toBe('')
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
