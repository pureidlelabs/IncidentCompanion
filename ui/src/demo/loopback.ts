/**
 * The case socket, answered from the browser.
 *
 * The prose channel opens a report's sections only once the other end has
 * said whether it holds text, and a socket that never opens leaves every
 * section pulsing as loading with nothing to write into. This end holds one
 * document per field, answers the sync handshake the way the server does,
 * and keeps what is written in the same store as the case, so a report
 * survives a reload the way the timeline does.
 *
 * Presence is not answered: the claims and releases the screens send reach
 * nobody, which is what a case with one visitor in it looks like.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { readSyncMessage } from 'y-protocols/sync'
import * as Y from 'yjs'

import { base64 } from '@/api/proseSync'

import { loadProse, saveProse } from './store'

/** The origin an applied frame carries, which the channel's own updates do not. */
const WIRE = Symbol('wire')

const documents = new Map<string, Y.Doc>()

/** The document for one field, restored from the store on first use. */
async function documentFor(field: string): Promise<Y.Doc> {
  const held = documents.get(field)
  if (held) return held
  const doc = new Y.Doc()
  const stored = await loadProse(field)
  const restored = stored === null ? null : base64.decode(stored)
  if (restored) Y.applyUpdate(doc, restored, WIRE)
  // Every update is saved, the wire's included: this end sends nothing of its
  // own, so there is no echo to keep out, and the wire is where the text comes from.
  doc.on('update', () => {
    void saveProse(field, base64.encode(Y.encodeStateAsUpdate(doc)))
  })
  documents.set(field, doc)
  return doc
}

/** Forget every document, for a reset. */
export function forgetProse(): void {
  for (const doc of documents.values()) doc.destroy()
  documents.clear()
}

type Listener = ((event: { data: string }) => void) | null

/**
 * One socket, open from the next tick and answering only `prose.sync`.
 *
 * `readyState` is `OPEN` from construction rather than after `onopen`: the
 * link reads it before sending, and a socket that reports connecting while
 * the handshake is in flight drops the handshake.
 */
export class LoopbackSocket {
  readonly url: string
  readonly readyState = 1
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: Listener = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    queueMicrotask(() => this.onopen?.())
  }

  send(data: string): void {
    let message: { type?: unknown; field?: unknown; update?: unknown }
    try {
      message = JSON.parse(data) as typeof message
    } catch {
      return
    }
    if (message.type !== 'prose.sync') return
    if (typeof message.field !== 'string' || typeof message.update !== 'string') return
    const { field, update } = message
    void this.answer(field, update)
  }

  private async answer(field: string, update: string): Promise<void> {
    const bytes = base64.decode(update)
    if (!bytes) return
    const doc = await documentFor(field)
    const reply = encoding.createEncoder()
    try {
      readSyncMessage(decoding.createDecoder(bytes), reply, doc, WIRE)
    } catch {
      return
    }
    // A step 1 gets a step 2, which is what settles the channel; an update
    // gets nothing back, as the server answers only when it has something to say.
    const frame =
      encoding.length(reply) > 0
        ? { type: 'prose.sync', field, update: base64.encode(encoding.toUint8Array(reply)) }
        : null
    if (frame === null) return
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(frame) }))
  }

  close(): void {
    /* nothing to release */
  }
}
