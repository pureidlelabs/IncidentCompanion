/**
 * The case socket, answered from the browser.
 *
 * The prose channel opens a report's sections and a note's body only once the
 * other end has said whether it holds text, and a socket that never opens
 * leaves every one of them pulsing as loading with nothing to write into. This
 * end holds one document per field, answers the sync handshake the way the
 * server does, and keeps what is written in the same store as the case, so a
 * report survives a reload the way the timeline does.
 *
 * A note's document is seeded from its `note` column the way the server seeds
 * one, and the column is re-derived as the document changes, so the list's
 * preview and the editor say the same thing.
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

/** The fragment a note's prose lives in, as the server names it. */
const NOTE_FRAGMENT = 'note'

/** A store write follows the last update by this much, so typing costs one write. */
const SAVE_AFTER_MS = 400

export interface LoopbackSeeds {
  /** The text a field starts from where nothing is stored, or nothing. */
  seedOf?: (field: string) => string | null
  /** Told the field's flattened text whenever its document changes. */
  onText?: (field: string, text: string) => void
}

let seeds: LoopbackSeeds = {}

/** What the loopback seeds from and tells, set once by the installer. */
export function seedLoopback(next: LoopbackSeeds): void {
  seeds = next
}

/** The text of a document, as the server derives a note's column from it. */
export function textOf(doc: Y.Doc): string {
  const flat = (node: unknown): string => {
    if (node instanceof Y.XmlText) {
      const runs = node.toDelta() as { insert?: unknown }[]
      return runs.map((run) => (typeof run.insert === 'string' ? run.insert : '')).join('')
    }
    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      return node.toArray().map(flat).join('')
    }
    return ''
  }
  return doc.getXmlFragment(NOTE_FRAGMENT).toArray().map(flat).join('\n').trim()
}

function seed(doc: Y.Doc, text: string): void {
  const fragment = doc.getXmlFragment(NOTE_FRAGMENT)
  const paragraphs = text.split('\n').map((line) => {
    const paragraph = new Y.XmlElement('paragraph')
    if (line) paragraph.insert(0, [new Y.XmlText(line)])
    return paragraph
  })
  fragment.insert(0, paragraphs)
}

/**
 * The document for one field, restored from the store or seeded on first use.
 *
 * The promise is what the map holds, so two handshakes for one field that
 * overlap the store read share one document rather than each building their
 * own and the map keeping the last.
 */
const documents = new Map<string, Promise<Y.Doc>>()

/** Saves for one field, in order: a later state never lands under an earlier one. */
const saving = new Map<string, Promise<void>>()

async function build(field: string): Promise<Y.Doc> {
  // `gc: false`, as every other holder of these fields: this end persists the
  // document, and a collected history cannot be handed back whole.
  const doc = new Y.Doc({ gc: false })
  const stored = await loadProse(field)
  const restored = stored === null ? null : base64.decode(stored)
  if (restored) Y.applyUpdate(doc, restored)
  else {
    const text = seeds.seedOf?.(field) ?? null
    if (text) seed(doc, text)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  doc.on('update', () => {
    seeds.onText?.(field, textOf(doc))
    clearTimeout(timer)
    timer = setTimeout(() => {
      const encoded = base64.encode(Y.encodeStateAsUpdate(doc))
      const after = (saving.get(field) ?? Promise.resolve()).then(() => saveProse(field, encoded))
      saving.set(field, after)
    }, SAVE_AFTER_MS)
  })
  return doc
}

function documentFor(field: string): Promise<Y.Doc> {
  const held = documents.get(field)
  if (held) return held
  const made = build(field)
  documents.set(field, made)
  return made
}

/** Forget every document, for a reset. */
export function forgetProse(): void {
  for (const made of documents.values()) void made.then((doc) => doc.destroy())
  documents.clear()
}

type Listener = ((event: { data: string }) => void) | null

/**
 * One socket, open from the next tick and answering only `prose.sync`.
 *
 * `readyState` is `OPEN` from construction rather than after `onopen`: the
 * link reads it before sending, and a socket that reports connecting while
 * the handshake is in flight drops the handshake. It never closes, so the
 * link schedules no reconnect.
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
      readSyncMessage(decoding.createDecoder(bytes), reply, doc, null)
    } catch {
      return
    }
    // A step 1 gets a step 2, which is what settles the channel; an update
    // gets nothing back, as the server answers only when it has something to say.
    if (encoding.length(reply) === 0) return
    const frame = { type: 'prose.sync', field, update: base64.encode(encoding.toUint8Array(reply)) }
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(frame) }))
  }

  close(): void {
    /* nothing to release */
  }
}
