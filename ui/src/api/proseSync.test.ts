/**
 * The prose CRDT channel.
 *
 * **The fake server holds a real `Y.Doc` and speaks the real protocol**, so a
 * test asserting that two analysts converge is asserting convergence rather
 * than that bytes were forwarded. It is still a stand-in: what it cannot check
 * is that the server end behaves the same way, and the two ends fail in
 * ways that name something else when they disagree about framing. The pair is
 * driven together in `server/e2e/two-analysts.spec.ts`; the server's own suite
 * holds the server's half on its own.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { beforeEach, describe, expect, it } from 'vitest'
import { readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'

import type { CaseLink, Message } from './caseSocket'
import { ProseChannel, base64 } from './proseSync'

const FIELD = 'report_blocks:b1:body'

/** The server, as far as a channel can tell: it holds the document. */
class Relay {
  readonly links: FakeLink[] = []
  /** Every message the relay was given, for asserting what went on the wire. */
  readonly sent: { from: number; message: Message }[] = []
  /** The authoritative document, as `ProseService` holds one per field. */
  readonly doc = new Y.Doc({ gc: false })
  /** The row's markdown, which the server seeds a cold document from. */
  row: string | null = null
  private seeded = false

  link(): FakeLink {
    const at = this.links.length
    const link = new FakeLink(this, at)
    this.links.push(link)
    return link
  }

  /** Put content in before anyone connects, as a stored document would be. */
  preload(text: string): void {
    this.doc.getXmlFragment('default').insert(0, [new Y.XmlText(text)])
  }

  receive(from: number, message: Message): void {
    this.sent.push({ from, message })
    this.seed()
    if (message.type === 'prose.awareness') {
      for (const [at, link] of this.links.entries()) {
        if (at !== from) link.deliver(message)
      }
      return
    }
    if (message.type !== 'prose.sync') return
    const bytes = typeof message.update === 'string'
      ? base64.decode(message.update) : null
    if (!bytes) return

    const field = String(message.field)
    const before = Y.encodeStateVector(this.doc)
    const reply = encoding.createEncoder()
    readSyncMessage(decoding.createDecoder(bytes), reply, this.doc, 'relay')
    if (encoding.length(reply) > 0) {
      this.send(from, field, encoding.toUint8Array(reply))
    }
    // Its own step 1 in answer to a step 1, so it learns what the client has.
    if (bytes[0] === 0) {
      const ask = encoding.createEncoder()
      writeSyncStep1(ask, this.doc)
      this.send(from, field, encoding.toUint8Array(ask))
    }
    // What the transaction added goes to everyone else.
    const diff = Y.encodeStateAsUpdate(this.doc, before)
    if (diff.length > 2) {
      const out = encoding.createEncoder()
      writeUpdate(out, diff)
      for (const [at] of this.links.entries()) {
        if (at !== from) this.send(at, field, encoding.toUint8Array(out))
      }
    }
  }

  /**
   * What the server does with a cold document: fill it from the row on the
   * way in, before anyone is answered. There is one server, so there is no
   * question of which participant does it.
   */
  private seed(): void {
    if (this.seeded) return
    this.seeded = true
    if (this.doc.getXmlFragment('default').length) return
    this.doc.getXmlFragment('default')
      .insert(0, [new Y.XmlText(this.row ?? '')])
  }

  private send(to: number, field: string, payload: Uint8Array): void {
    this.links[to]?.deliver({
      type: 'prose.sync', field, update: base64.encode(payload),
    })
  }
}

class FakeLink implements CaseLink {
  connected = false
  private readonly listeners = new Set<(message: Message) => void>()
  private readonly watchers = new Set<(up: boolean) => void>()

  constructor(private readonly relay: Relay, private readonly at: number) {}

  send(message: Message) { if (this.connected) this.relay.receive(this.at, message) }
  subscribe(listener: (message: Message) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  onConnected(listener: (up: boolean) => void) {
    this.watchers.add(listener)
    listener(this.connected)
    return () => { this.watchers.delete(listener) }
  }
  deliver(message: Message) { for (const l of [...this.listeners]) l(message) }
  up() { this.connected = true; for (const w of [...this.watchers]) w(true) }
  down() { this.connected = false; for (const w of [...this.watchers]) w(false) }
}

/** The text of a channel's document, through the fragment Tiptap would use. */
function textOf(channel: ProseChannel): string {
  return channel.doc.getText('body').toJSON()
}

function type(channel: ProseChannel, text: string): void {
  channel.doc.getText('body').insert(channel.doc.getText('body').length, text)
}

let relay: Relay

beforeEach(() => { relay = new Relay() })

/** A channel on a link that is already up, so the handshake has happened. */
function connected(field = FIELD, options = {}): ProseChannel {
  const link = relay.link()
  const channel = new ProseChannel(link, field, options)
  link.up()
  return channel
}

describe('opening a field', () => {
  it('offers its state vector as soon as the socket is up', () => {
    const link = relay.link()
    const channel = new ProseChannel(link, FIELD)
    expect(relay.sent).toEqual([])

    link.up()
    const first = relay.sent.at(0)?.message
    expect(first?.type).toBe('prose.sync')
    expect(first?.field).toBe(FIELD)
    // Sync step 1 - the first byte of the y-protocols framing.
    expect(base64.decode(String(first?.update))?.[0]).toBe(0)
    channel.destroy()
  })

  it('stays opening until the server answers', () => {
    // The status gate exists so nothing writes into the document before the
    // answer. A channel that reported itself ready early would let the editor
    // seed against state still in flight, and the text would double.
    const link = relay.link()
    const channel = new ProseChannel(link, FIELD)
    expect(channel.status).toBe('opening')
    channel.destroy()
  })

  it('is ready as soon as the server answers, cold section or not', () => {
    // There is no seeding status: the server fills a cold document from the
    // row before it answers, so a client is either waiting or ready.
    const channel = connected()

    expect(channel.status).toBe('ready')
    channel.destroy()
  })

  it('arrives with the section the server seeded from the row', () => {
    relay.row = 'written before live prose existed'
    const channel = connected()

    expect(channel.doc.getXmlFragment('default').toJSON())
      .toContain('written before live prose existed')
    channel.destroy()
  })

  it('gets a field that already has content, unseeded', () => {
    relay.preload('stored')
    relay.row = 'the row says something else'
    const channel = connected()

    const held = channel.doc.getXmlFragment('default').toJSON()
    expect(held).toContain('stored')
    expect(held).not.toContain('the row says something else')
    channel.destroy()
  })

  it('re-syncs after a reconnect', () => {
    // The server has no memory of which fields a socket had open, so a client
    // that skipped this would sit on a document nobody sends to any more.
    const link = relay.link()
    const channel = new ProseChannel(link, FIELD)
    link.up()
    const before = relay.sent.length
    link.down()
    link.up()

    const resent = relay.sent.slice(before).map((s) => s.message.type)
    expect(resent).toContain('prose.sync')
    channel.destroy()
  })

  it('ignores a message for a different field', () => {
    const channel = connected()
    const before = channel.doc.getXmlFragment('default').toJSON()
    relay.links.at(0)?.deliver({
      type: 'prose.sync',
      field: 'some:other:field',
      update: base64.encode(new Uint8Array([255, 255, 255])),
    })

    expect(channel.doc.getXmlFragment('default').toJSON()).toBe(before)
    channel.destroy()
  })
})

describe('carrying edits', () => {
  it('reaches the other analyst', () => {
    const one = connected()
    const two = connected()
    type(one, 'the initial finding')

    expect(textOf(two)).toBe('the initial finding')
    one.destroy()
    two.destroy()
  })

  it('converges when both type at once', () => {
    const one = connected()
    const two = connected()
    type(one, 'aaa')
    type(two, 'bbb')

    expect(textOf(one)).toBe(textOf(two))
    expect(textOf(one)).toHaveLength(6)
    one.destroy()
    two.destroy()
  })

  it('does not send back what it received', () => {
    // Echoing is harmless to a CRDT and pure noise on the wire - and it makes
    // every keystroke cost two messages instead of one.
    const one = connected()
    const two = connected()
    relay.sent.length = 0
    type(one, 'typed')

    expect(relay.sent.filter((s) => s.from === 1)).toEqual([])
    one.destroy()
    two.destroy()
  })

  it('sends one message per edit and never a whole copy of the document', () => {
    // The server applies each update as it arrives, so there is nothing left
    // for a whole-document message to be for: one message per edit, never a
    // copy of the document.
    const channel = connected()
    type(channel, 'a long stretch of narrative prose about the incident')
    relay.sent.length = 0
    type(channel, '.')

    expect(relay.sent).toHaveLength(1)
    expect(base64.decode(String(relay.sent[0]?.message.update))?.length)
      .toBeLessThan(60)
    channel.destroy()
  })

  it('drops an update it cannot decode without disturbing the document', () => {
    const channel = connected()
    type(channel, 'kept')
    relay.links.at(0)?.deliver({
      type: 'prose.sync', field: FIELD, update: 'not base64 at all!!',
    })

    expect(textOf(channel)).toBe('kept')
    channel.destroy()
  })

  it('drops a payload that decodes but is not a sync message', () => {
    const channel = connected()
    type(channel, 'kept')
    relay.links.at(0)?.deliver({
      type: 'prose.sync',
      field: FIELD,
      update: base64.encode(new Uint8Array([255, 255, 255, 255, 255])),
    })

    expect(textOf(channel)).toBe('kept')
    channel.destroy()
  })

  it('survives an update that is not a string', () => {
    const channel = connected()
    relay.links.at(0)?.deliver({
      type: 'prose.sync', field: FIELD, update: 42,
    })

    expect(channel.status).toBe('ready')
    channel.destroy()
  })
})

describe('joining a document', () => {
  it('is answered by the server, with no other tab connected', () => {
    const author = connected()
    type(author, 'written by the first analyst')
    author.destroy()

    const joiner = connected()

    expect(textOf(joiner)).toBe('written by the first analyst')
    joiner.destroy()
  })

  it('hands over what the server is missing', () => {
    // The half that is easy to leave out: the server answering "here is what
    // you are missing" tells it nothing about what *it* lacks. A tab that
    // typed while its socket was down would keep those edits for ever.
    const link = relay.link()
    const channel = new ProseChannel(link, FIELD)
    channel.doc.getText('body').insert(0, 'typed while disconnected')
    link.up()

    expect(relay.doc.getText('body').toJSON())
      .toBe('typed while disconnected')
    channel.destroy()
  })

  it('tells the server nothing it did not already have', () => {
    // A caught-up client still answers the server's step 1, with the empty
    // update - four bytes, and standard. What must not happen is it handing
    // back a copy of what it was just sent, which is a whole document on the
    // wire every time anyone opens a section.
    const first = connected()
    type(first, 'shared')
    const before = Y.encodeStateVector(relay.doc)

    const second = connected()

    expect(Y.encodeStateVector(relay.doc)).toEqual(before)
    first.destroy()
    second.destroy()
  })
})

describe('carets', () => {
  it('are relayed to the other analyst', () => {
    const one = connected(FIELD, { user: { name: 'R. Okonkwo' } })
    const two = connected()
    const seen: string[] = []
    two.awareness.on('update', () => {
      for (const state of two.awareness.getStates().values()) {
        const user = (state as { user?: { name?: string } }).user
        if (user?.name) seen.push(user.name)
      }
    })
    one.awareness.setLocalStateField('user', { name: 'R. Okonkwo' })

    expect(seen).toContain('R. Okonkwo')
    one.destroy()
    two.destroy()
  })

  it('are never mistaken for document traffic', () => {
    // A caret must never travel as a sync frame: the server stores those, and
    // a caret belonging to a socket that has gone is not a fact about the
    // case.
    const channel = connected()
    relay.sent.length = 0
    channel.awareness.setLocalStateField('user', { name: 'A' })

    const kinds = relay.sent.map((s) => s.message.type)
    expect(kinds).not.toContain('prose.sync')
    expect(kinds).toContain('prose.awareness')
    channel.destroy()
  })

  it('go away when the tab does', () => {
    const one = connected(FIELD, { user: { name: 'Leaving' } })
    const two = connected()
    one.destroy()

    const names = [...two.awareness.getStates().values()]
      .map((s) => (s as { user?: { name?: string } }).user?.name)
      .filter(Boolean)
    expect(names).not.toContain('Leaving')
    two.destroy()
  })
})

describe('after destroy', () => {
  it('sends nothing more', () => {
    const channel = connected()
    channel.destroy()
    relay.sent.length = 0
    type(channel, 'after the end')

    expect(relay.sent).toEqual([])
  })

  it('does not flush a copy of the document on the way out', () => {
    // The server applied every update as it arrived and owns persisting them,
    // so a closing tab has nothing the record is missing.
    const channel = connected()
    type(channel, 'typed then closed')
    relay.sent.length = 0
    channel.destroy()

    expect(relay.sent.filter((s) => s.message.type === 'prose.sync')).toEqual([])
  })
})

describe('history', () => {
  /**
   * **Garbage collection is silent and one-way.** A `Y.Doc` collects deleted
   * content on the transaction that deletes it, so a document built with the
   * default `gc: true` has no past to return - and flipping the flag later
   * recovers nothing already dropped. Both tests below fail on a default
   * document, one by throwing and one by returning the wrong text.
   */
  it('reconstructs a past state after the text was deleted', () => {
    const channel = connected()
    type(channel, 'the initial finding was a false positive')
    const past = Y.snapshot(channel.doc)
    channel.doc.getText('body').delete(0, 12)

    expect(Y.createDocFromSnapshot(channel.doc, past).getText('body').toJSON())
      .toBe('the initial finding was a false positive')
    channel.destroy()
  })

  it('keeps the deleted content in what the server was sent', () => {
    // The wire copy is the one that matters: a collected document exports a
    // record with the history already missing, so every later reader inherits
    // the loss whatever flag *they* open with.
    const channel = connected()
    type(channel, 'the initial finding was a false positive')
    const past = Y.snapshot(channel.doc)
    channel.doc.getText('body').delete(0, 12)

    expect(Y.createDocFromSnapshot(relay.doc, past).getText('body').toJSON())
      .toBe('the initial finding was a false positive')
    channel.destroy()
  })
})

describe('base64', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128])
    expect(base64.decode(base64.encode(bytes))).toEqual(bytes)
  })

  it('handles a document too large for a single fromCharCode call', () => {
    // `String.fromCharCode(...bytes)` throws past the argument limit, and a
    // report section reaches tens of kilobytes without trying.
    const big = new Uint8Array(200_000).map((_, at) => at % 256)
    expect(base64.decode(base64.encode(big))).toEqual(big)
  })

  it('returns null rather than throwing on a bad payload', () => {
    expect(base64.decode('not base64 at all!!')).toBeNull()
  })
})

describe('a refusal from the server', () => {
  /**
   * **The window is narrow and the loss is total.** A filed report renders
   * read-only, so an analyst cannot normally type into one - but analyst A can
   * be mid-paragraph when analyst B files it, and until A's client sees the
   * change feed and refetches, every frame A sends is refused. A's words are
   * in A's own document and nowhere else.
   *
   * Dropping the frame as unknown is what makes that silent: the editor stays
   * writable, the text keeps appearing, and nothing ever says it has stopped
   * going anywhere.
   */
  it('settles refused and keeps the stamp the server named', () => {
    const seen: string[] = []
    const channel = connected(FIELD, { onStatus: (s: string) => seen.push(s) })
    relay.links.at(0)?.deliver({
      type: 'prose.refused',
      field: FIELD,
      reason: 'report-sent',
      sentAt: '2026-08-03T09:00:00.000Z',
    })

    expect(channel.status).toBe('refused')
    expect(channel.refusedAt).toBe('2026-08-03T09:00:00.000Z')
    expect(seen).toContain('refused')
  })

  it('ignores a refusal aimed at another field', () => {
    // One socket carries every field of the report; a refusal for a section
    // this channel does not hold must not close this one.
    const channel = connected(FIELD)
    relay.links.at(0)?.deliver({
      type: 'prose.refused',
      field: 'report_blocks:other:body',
      reason: 'report-sent',
      sentAt: '2026-08-03T09:00:00.000Z',
    })

    expect(channel.status).not.toBe('refused')
    expect(channel.refusedAt).toBeNull()
  })

  it('stays refused when a later sync frame arrives', () => {
    // The server answers a state request even on a filed report, so that the
    // text can still be read. That answer must not put the editor back.
    const channel = connected(FIELD)
    relay.links.at(0)?.deliver({
      type: 'prose.refused',
      field: FIELD,
      reason: 'report-sent',
      sentAt: '2026-08-03T09:00:00.000Z',
    })
    // A sync step 1 from the server, which is what reading a filed report
    // still produces.
    const reply = encoding.createEncoder()
    writeSyncStep1(reply, relay.doc)
    relay.links.at(0)?.deliver({
      type: 'prose.sync',
      field: FIELD,
      update: base64.encode(encoding.toUint8Array(reply)),
    })

    expect(channel.status).toBe('refused')
  })
})
