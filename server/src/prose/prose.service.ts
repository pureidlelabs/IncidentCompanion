/**
 * The written prose: one live `Y.Doc` per record, held while anyone is in it.
 *
 * **Two kinds of record, and the granularity differs on purpose.** A report is
 * one document with a fragment per block - one awareness roster, so an outline
 * can say *"Bob is in section 4"*, and one restore point per report rather
 * than one per section. A **note** is one document on its own, because a note
 * is created, read and deleted on its own and a case-wide document would keep
 * a fragment for every note that ever went.
 *
 * **The codec, not a second server.** `y-protocols` is the state-vector
 * exchange every Yjs transport speaks, and it rides the case socket that
 * already carries presence, claims and the change feed - behind the origin
 * check, the session and the case-access check.
 *
 * **Instances converge over the same pub/sub as everything else.** A document
 * lives in the memory of whichever instance a socket landed on, so every local
 * update is published to the case's channel and every remote one is applied
 * with the origin `REMOTE` - which fans it out to this instance's sockets
 * through the ordinary update handler and never publishes it back. The relay
 * is an interface this module *declares* rather than an import of the socket
 * tier: `live` reaches `prose`, never the reverse.
 *
 * **A report is seeded from nothing; a note is seeded once.** No column holds
 * a section's words, so a section nobody has opened is genuinely empty and
 * arrives empty. A note's words *do* have a column - `casenotes.note`, which
 * the index row and the search read because a note has no heading to be found
 * by - so a note that arrived from a demo, a CSV import or an archive with a
 * body and no document has that body put into the document the first time
 * anybody opens it, and from then on the document is the record and the column
 * is derived from it.
 *
 * **The row is written after a quiet moment**, not per keystroke - the whole
 * document is re-encoded each time. The last reader out flushes synchronously,
 * so a document is never left newer in memory than on disk.
 */
import { Inject, Injectable, Logger, Optional, type OnApplicationShutdown } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import {
  messageYjsSyncStep1,
  readSyncMessage,
  writeSyncStep1,
  writeUpdate,
} from 'y-protocols/sync'
import * as Y from 'yjs'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { reports } from '../db/schema/report.js'
import { caseNotes } from '../db/schema/tracker.js'
import { withCase } from '../db/scope.js'

/**
 * The one fragment a note's document holds.
 *
 * A report addresses a fragment per block because one document carries the
 * whole report; a note is one body, so the name is a constant at both ends
 * rather than something a frame gets to choose. -> `ui/src/screens/notes.tsx`
 */
export const NOTE_FRAGMENT = 'note'

/**
 * The tables that store a Yjs document in a `document` column.
 *
 * **A key naming anything else is refused rather than guessed at.** The key
 * arrives from a browser, so an unrecognised table has to miss - see `resolve`.
 */
const PROSE_TABLES = ['reports', 'casenotes'] as const
export type ProseTable = (typeof PROSE_TABLES)[number]

/**
 * The note's words, as plain text, for the column the index and the search
 * read.
 *
 * **From the deltas rather than `toString()`.** `Y.XmlText.toString()`
 * serialises marks as tags, so a bolded word would put `<strong>` into the
 * column the index draws and the CSV exports.
 */
export function noteText(doc: Y.Doc): string {
  const flat = (node: unknown): string => {
    if (node instanceof Y.XmlText) {
      // `toDelta()` is typed `any[]` by yjs; the only shape read here is the
      // insert, and anything that is not a string is an embed rather than text.
      const runs = node.toDelta() as { insert?: unknown }[]
      return runs.map((run) => (typeof run.insert === 'string' ? run.insert : '')).join('')
    }
    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      return node.toArray().map(flat).join('')
    }
    return ''
  }
  return doc
    .getXmlFragment(NOTE_FRAGMENT)
    .toArray()
    .map(flat)
    .join('\n')
    .trim()
}

function isProseTable(name: string): name is ProseTable {
  return (PROSE_TABLES as readonly string[]).includes(name)
}

const QUIET_MS = 750

/**
 * Which record a document key names.
 *
 * The client addresses a document as `<table>:<row id>:<column>`, the scheme
 * every live field on every screen uses. **The key names the document, not a
 * block** - one report is one document, and which fragment inside it a
 * particular editor writes into is the browser's business and never reaches
 * this side.
 */
export interface ProseRecord {
  table: ProseTable
  id: string
}

/**
 * A record, plus the state a caller decides per frame from.
 *
 * `ProseRecord` alone is what opening, releasing and flushing need; only the
 * socket's per-frame refusal wants the stamp, and it is carried on the lookup
 * `resolve` already does because a second query for it would run per keystroke.
 */
export interface ProseAddress extends ProseRecord {
  /**
   * When the record was frozen, or null.
   *
   * **Always null for a note**, which has nothing to be filed into: a note is
   * the analyst's own scratchpad and never becomes a deliverable, so no state
   * of it refuses a write. -> `domain/entities/case-note.ts`
   *
   * **Carried from the lookup `resolve` already does**, because the caller has
   * to decide per frame whether an update may be applied and a second query
   * for that would run per keystroke. It is the timestamp rather than a boolean
   * so the refusal can say *when*, which is the only thing that makes the
   * sentence actionable. -> `report/freeze.ts`
   */
  sentAt: Date | null
}


/**
 * How a document reaches the other instances.
 *
 * **Declared here rather than imported**, so the record does not depend on the
 * transport that happens to carry it. `PresenceStore` satisfies it; so would a
 * test double, which is what makes the fan-out assertable at all.
 */
export const PROSE_RELAY = Symbol('PROSE_RELAY')

export interface ProseRelay {
  publish(caseId: string, payload: string): Promise<void>
  subscribe(caseId: string, listener: (payload: string) => void): Promise<() => void>
}

/**
 * Marks a transaction as arriving from another instance, so it is applied and
 * not published back. The client end uses the same idea for the same reason.
 */
const REMOTE = Symbol('remote')

/** What one instance sends the others when a document moves. */
interface ProseFrame {
  type: 'prose.document'
  /** `<table>/<row id>`, so two tables' ids can never collide on the channel. */
  record: string
  /** The update, base64 - the payload is a JSON string on a text channel. */
  update: string
  from: string
}
interface LiveDocument {
  doc: Y.Doc
  readers: number
  timer: NodeJS.Timeout | null
  dirty: boolean
  unsubscribe: (() => void) | null
}

/**
 * A report's own document, for a caller holding nothing but the report id.
 *
 * Rendering and duplication reach a document without a frame, so they never
 * have a `resolve` result to pass.
 */
export function reportDocument(id: string): ProseRecord {
  return { table: 'reports', id }
}

function keyOf(caseId: string, address: ProseRecord): string {
  return `${caseId}/${address.table}/${address.id}`
}

function recordOf(address: ProseRecord): string {
  return `${address.table}/${address.id}`
}

/**
 * Put a note's stored words into its empty document.
 *
 * One paragraph per line, which is the node shape the editor's schema expects
 * - a bare `Y.XmlText` at the top of the fragment renders as nothing.
 */
function seedNote(doc: Y.Doc, text: string): void {
  const fragment = doc.getXmlFragment(NOTE_FRAGMENT)
  const paragraphs = text.split('\n').map((line) => {
    const paragraph = new Y.XmlElement('paragraph')
    if (line) paragraph.insert(0, [new Y.XmlText(line)])
    return paragraph
  })
  fragment.insert(0, paragraphs)
}

@Injectable()
export class ProseService implements OnApplicationShutdown {
  private readonly log = new Logger(ProseService.name)
  private readonly live = new Map<string, Promise<LiveDocument>>()

  /**
   * **This instance's own name**, minted per process, so a frame can say who
   * sent it.
   *
   * **It is not what stops the echo, and measured as much**: removing the
   * `from` check leaves the suite green, because a frame coming back to its
   * sender is applied with `REMOTE` - a no-op on a document that already holds
   * it - and `REMOTE` is what stops it being published again. The check saves
   * that pointless apply on every local edit; the origin is the mechanism.
   */
  private readonly instance = randomUUID()

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    /**
     * **Optional, and single-instance is the degraded mode rather than the
     * broken one.** With no relay a document is correct for every socket on
     * this process and stale for any other instance - which is exactly what a
     * test without Redis wants, and what a one-process install is.
     */
    @Optional() @Inject(PROSE_RELAY) private readonly relay?: ProseRelay,
  ) {}

  /**
   * Resolve a field key to the row that stores it.
   *
   * **Refuses anything it does not recognise rather than guessing.** A field
   * key arrives over a socket from a browser; treating an unknown one as "some
   * report" is how one case's prose would be written into another's document.
   * The case is checked too - the block has to belong to the case whose socket
   * asked.
   */
  async resolve(caseId: string, field: string): Promise<ProseAddress | null> {
    const parts = field.split(':')
    if (parts.length !== 3) return null
    const [table, rowId, column] = parts as [string, string, string]
    if (column !== 'document') return null
    if (!isProseTable(table)) return null
    if (!/^[0-9a-f-]{36}$/i.test(rowId)) return null

    // **Belt-and-braces, and measured as redundant while the policy stands.**
    // `withCase` sets `app.case_id` and the row-level security policy already
    // returns nothing for another case's row - removing this clause leaves the
    // whole suite green. It says the scope in SQL and survives someone
    // loosening the policy; it is not the mechanism, and the policy is.
    // -> `db/schema/scoped.ts`
    if (table === 'casenotes') {
      const [note] = await withCase(this.db, caseId, (tx) =>
        tx
          .select({ id: caseNotes.id })
          .from(caseNotes)
          .where(and(eq(caseNotes.id, rowId), eq(caseNotes.caseId, caseId))),
      )
      if (!note) return null
      // A note never freezes, so there is no state in which a frame for one is
      // refused. Written as a literal rather than read from a column, because
      // there is no column and inventing one would be the thing to maintain.
      return { table, id: note.id, sentAt: null }
    }

    const [report] = await withCase(this.db, caseId, (tx) =>
      tx
        .select({ id: reports.id, sentAt: reports.sentAt })
        .from(reports)
        .where(and(eq(reports.id, rowId), eq(reports.caseId, caseId))),
    )
    if (!report) return null
    return { table, id: report.id, sentAt: report.sentAt }
  }

  /**
   * The live document for a report, loaded from its row on first reader.
   *
   * **Refcounted, and the count is what keeps it alive.** Two analysts in
   * different sections of one report share the document; dropping it when the
   * first leaves would lose the second's unflushed work.
   */
  async open(caseId: string, address: ProseRecord): Promise<Y.Doc> {
    const key = keyOf(caseId, address)
    const held = this.live.get(key)
    if (held) {
      const entry = await held
      entry.readers += 1
      return entry.doc
    }

    // **The promise goes in the map before the first await**, so a second
    // caller arriving during the row read waits for this document instead of
    // building its own. Two documents for one report never converge -- the
    // relay drops a frame from its own instance -- so one analyst's whole
    // session is written nowhere, and their tab closing destroys the document
    // the other is still typing into. `CaseChannel.subscriptions` holds the
    // same shape for the same reason.
    const building = this.build(caseId, address)
    this.live.set(key, building)
    try {
      return (await building).doc
    } catch (error) {
      this.live.delete(key)
      throw error
    }
  }

  private async build(caseId: string, address: ProseRecord): Promise<LiveDocument> {
    const doc = new Y.Doc({ gc: false })
    if (address.table === 'casenotes') {
      const [row] = await withCase(this.db, caseId, (tx) =>
        tx
          .select({ document: caseNotes.document, note: caseNotes.note })
          .from(caseNotes)
          .where(and(eq(caseNotes.id, address.id), eq(caseNotes.caseId, caseId))),
      )
      if (row?.document) Y.applyUpdate(doc, new Uint8Array(row.document))
      // **The words a note arrived with become its document, once.** A report
      // block has no column to seed from, so nothing is seeded there; a note
      // reaches the app from a demo, a CSV import or a `.iccase` archive with
      // its body already written, and opening one to an empty editor would
      // read as the note having been lost. Guarded on there being no document
      // yet, so it can never overwrite what anybody typed.
      else if (row?.note) seedNote(doc, row.note)
    } else {
      const [row] = await withCase(this.db, caseId, (tx) =>
        tx
          .select({ document: reports.document })
          .from(reports)
          .where(and(eq(reports.id, address.id), eq(reports.caseId, caseId))),
      )
      if (row?.document) Y.applyUpdate(doc, new Uint8Array(row.document))
    }

    // **Registered before the first update can land.** `doc.on('update')` is
    // attached here rather than by the caller, so there is no window in which
    // an update is applied to a document nothing is watching.
    const entry: LiveDocument = { doc, readers: 1, timer: null, dirty: false, unsubscribe: null }
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      entry.dirty = true
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = setTimeout(() => {
        void this.flush(caseId, address)
      }, QUIET_MS)

      // **Not what another instance just told us.** Publishing it back is an
      // echo every instance would forward again.
      if (origin !== REMOTE) void this.relayOut(caseId, address, update)
    })
    // **Set before returning, so no update can land on an unsubscribed
    // document.** Awaited for the same reason: a subscription still in flight
    // is a window in which another instance's edits are dropped silently.
    if (this.relay) {
      entry.unsubscribe = await this.relay.subscribe(caseId, (payload) => {
        this.relayIn(address, doc, payload)
      })
    }
    return entry
  }

  private async relayOut(
    caseId: string,
    address: ProseRecord,
    update: Uint8Array,
  ): Promise<void> {
    if (!this.relay) return
    const frame: ProseFrame = {
      type: 'prose.document',
      record: recordOf(address),
      update: Buffer.from(update).toString('base64'),
      from: this.instance,
    }
    try {
      await this.relay.publish(caseId, JSON.stringify(frame))
    } catch (error) {
      // The document is still correct here and on disk; what is lost is the
      // other instances' view of it until their next read.
      this.log.warn(`could not relay a prose update for ${recordOf(address)}: ${String(error)}`)
    }
  }

  /**
   * Apply what another instance sent.
   *
   * **Every frame on the case's channel arrives here**, including presence and
   * the change feed, so anything that is not this document's update is dropped
   * without comment - a channel shared with other traffic is the price of not
   * standing up a second one.
   */
  private relayIn(address: ProseRecord, doc: Y.Doc, payload: string): void {
    let frame: Partial<ProseFrame>
    try {
      frame = JSON.parse(payload) as Partial<ProseFrame>
    } catch {
      return
    }
    if (frame.type !== 'prose.document') return
    if (frame.record !== recordOf(address)) return
    // Cheap rather than load-bearing - see `instance` above.
    if (frame.from === this.instance) return
    if (typeof frame.update !== 'string') return

    try {
      Y.applyUpdate(doc, new Uint8Array(Buffer.from(frame.update, 'base64')), REMOTE)
    } catch (error) {
      this.log.warn(`dropping a relayed prose update for ${recordOf(address)}: ${String(error)}`)
    }
  }

  /**
   * One reader has gone.
   *
   * **The last one out flushes before the document is dropped**, so what is in
   * memory is never newer than the row once nobody is holding it.
   */
  async release(caseId: string, address: ProseRecord): Promise<void> {
    const key = keyOf(caseId, address)
    const holding = this.live.get(key)
    if (!holding) return
    const held = await holding
    held.readers -= 1
    if (held.readers > 0) return

    if (held.timer) clearTimeout(held.timer)
    if (held.dirty) await this.flush(caseId, address)

    // **Asked again after the flush, because the flush is a database write.**
    // A reader arriving in that window takes this very document; deleting and
    // destroying it under them clears its observers, so their editor looks
    // normal while nothing they type is broadcast or written, and their own
    // release finds no entry to recover from.
    if (held.readers > 0) return
    held.unsubscribe?.()
    this.live.delete(key)
    held.doc.destroy()
  }

  /**
   * Apply one sync message and return what to answer with, if anything.
   *
   * **Empty means say nothing.** `readSyncMessage` writes a reply for a step 1
   * and leaves the encoder empty for an update, so answering unconditionally
   * puts a one-byte message on the wire for every keystroke of every client.
   */
  applySync(doc: Y.Doc, update: Uint8Array, origin: unknown): Uint8Array | null {
    const reply = encoding.createEncoder()
    try {
      // **The origin is the connection it came from**, so the update handler
      // that fans out to the other sockets can skip the one that already has
      // it. Passing a constant here sends every client its own keystrokes.
      readSyncMessage(decoding.createDecoder(update), reply, doc, origin)
    } catch (error) {
      // A frame this build cannot read is dropped rather than thrown: the
      // socket carries presence and the change feed too, and taking those down
      // over one malformed prose frame is the larger failure.
      this.log.warn(`dropping a prose frame: ${String(error)}`)
      return null
    }
    return encoding.length(reply) > 0 ? encoding.toUint8Array(reply) : null
  }

  /**
   * Does this frame only *ask* what the server has?
   *
   * **A read and a write arrive down the same pipe**, so a caller that must
   * refuse writes to a filed report - and still let one be read - has no other
   * way to tell them apart. A step 1 carries a state vector and changes
   * nothing; a step 2 and an update both carry content.
   *
   * **Read without applying, so the caller decides first.** `readSyncMessage`
   * reports the type it read *after* it has already applied the message, which
   * is one line too late to refuse anything.
   */
  isStateRequest(update: Uint8Array): boolean {
    try {
      return decoding.readVarUint(decoding.createDecoder(update)) === messageYjsSyncStep1
    } catch {
      // Unreadable is not a read request. A frame nobody can decode reaching
      // `applySync` is dropped there; guessing "harmless" here would let a
      // truncated update past the gate on its way to that drop.
      return false
    }
  }

  /** The server's own opening move: what it has, so the client can answer. */
  hello(doc: Y.Doc): Uint8Array {
    const encoder = encoding.createEncoder()
    writeSyncStep1(encoder, doc)
    return encoding.toUint8Array(encoder)
  }

  frameUpdate(update: Uint8Array): Uint8Array {
    const encoder = encoding.createEncoder()
    writeUpdate(encoder, update)
    return encoding.toUint8Array(encoder)
  }

  /**
   * Write the document to its row. Public so a test can force it.
   *
   * **The row's version is deliberately not bumped.** `reports.version` guards
   * the analyst-facing fields against a concurrent edit; the document is a
   * CRDT, which is the mechanism that makes concurrent writing safe, so
   * bumping it would refuse a title change because somebody was typing.
   */
  async flush(caseId: string, address: ProseRecord): Promise<void> {
    const holding = this.live.get(keyOf(caseId, address))
    if (!holding) return
    const held = await holding
    const bytes = Buffer.from(Y.encodeStateAsUpdate(held.doc))
    held.dirty = false
    try {
      await withCase(this.db, caseId, (tx) =>
        address.table === 'casenotes'
          ? tx
              .update(caseNotes)
              // **`note` is re-derived from the document on every flush.**
              // The document is the record; the column is the projection the
              // index row, the search and the CSV export read, and a note has
              // no heading to find it by instead. The column is also written
              // straight by the paths a note arrives on -- case seeding, the
              // archive import, the generic collection write -- and this
              // replaces whatever they left once a document exists.
              .set({ document: bytes, note: noteText(held.doc) })
              .where(and(eq(caseNotes.id, address.id), eq(caseNotes.caseId, caseId)))
          : tx
              .update(reports)
              .set({ document: bytes })
              .where(and(eq(reports.id, address.id), eq(reports.caseId, caseId))),
      )
    } catch (error) {
      // **Marked dirty again**, so the next quiet moment or the last reader
      // leaving tries once more. Swallowing it silently is how a report loses
      // an afternoon to a transient database error nobody saw.
      held.dirty = true
      this.log.error(`could not save the prose for ${recordOf(address)}: ${String(error)}`)
    }
  }

  /**
   * Write every document still held before the process exits.
   *
   * **The queued rewrite is what would be lost.** A document with an update
   * applied and its quiet moment still running is newer in memory than in its
   * row, and this clears that timer rather than waiting for it.
   */
  async onApplicationShutdown(): Promise<void> {
    for (const [key, holding] of this.live) {
      const held = await holding
      if (held.timer) clearTimeout(held.timer)
      if (!held.dirty) continue
      const [caseId, table, id] = key.split('/') as [string, ProseTable, string]
      await this.flush(caseId, { table, id })
    }
  }
}
