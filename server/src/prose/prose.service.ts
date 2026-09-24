/**
 * The written prose: one live `Y.Doc` per record, held while anyone is in it.
 *
 * **Two kinds of record, and the granularity differs on purpose.** A report is
 * one document with a fragment per block - one awareness roster, so an outline
 * can say *"Bob is in section 4"*. A **note** is one document on its own,
 * because a note is created, read and deleted on its own and a case-wide
 * document would keep a fragment for every note that ever went.
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
import type { IncomingHttpHeaders } from 'node:http'
import { and, eq, isNull } from 'drizzle-orm'
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
import { changeFeed } from '../db/schema/change-feed.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { sentReportIn } from '../db/schema/store-guards.js'
import { caseNotes } from '../db/schema/tracker.js'
import { withCase } from '../db/scope.js'
import { fragmentFor } from '../domain/prose-fields.js'

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
}
interface LiveDocument {
  doc: Y.Doc
  readers: number
  timer: NodeJS.Timeout | null
  dirty: boolean
  unsubscribe: (() => void) | null
  /** When the report was sent; a note is never sent. */
  sealed: Date | null
  /** Content waiting on a send that is deciding, or null when none is. */
  deciding: (() => void)[] | null
  /** Whoever wrote into it since it was last stored, the latest last. */
  writers: Map<string, Writer>
  /** The last flush queued; each waits for the one before it. */
  saving: Promise<void>
}

/** An analyst writing through a connection, and the headers that connection arrived with. */
export interface Writer {
  readonly id: string
  readonly label: string
  readonly headers: IncomingHttpHeaders
}

/** Told once a flush has stored what `writers` wrote. */
export type Saved = (caseId: string, record: ProseRecord, writers: readonly Writer[]) => void

/** What a connection's frame is answered with. */
export type Applied = { refused: Date } | { reply: Uint8Array | null }

/** A report's document held still for a send, at `bytes`. */
export interface Seal {
  readonly bytes: Uint8Array
  /** The send's stamp, or null where it did not stamp. Gives back the reader `seal` took. */
  settle(stamp: Date | null): Promise<void>
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
  private saved: Saved | undefined

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
  async resolve(caseId: string, field: string): Promise<ProseRecord | null> {
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
      return { table, id: note.id }
    }

    const [report] = await withCase(this.db, caseId, (tx) =>
      tx
        .select({ id: reports.id })
        .from(reports)
        .where(and(eq(reports.id, rowId), eq(reports.caseId, caseId))),
    )
    if (!report) return null
    return { table, id: report.id }
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
    // building its own. Two documents for one report each persist their own
    // state over the other's, so one analyst's whole
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
    const doc = new Y.Doc()
    let sealed: Date | null = null
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
      // read as the note having been lost. Stored at once: a document built
      // again from the words would hold them a second time for any client
      // still holding the first.
      else if (row?.note) {
        seedNote(doc, row.note)
        const document = Buffer.from(Y.encodeStateAsUpdate(doc))
        await withCase(this.db, caseId, (tx) =>
          tx
            .update(caseNotes)
            .set({ document })
            .where(and(eq(caseNotes.id, address.id), eq(caseNotes.caseId, caseId), isNull(caseNotes.document))),
        )
      }
    } else {
      const [row] = await withCase(this.db, caseId, (tx) =>
        tx
          .select({ document: reports.document, sentAt: reports.sentAt })
          .from(reports)
          .where(and(eq(reports.id, address.id), eq(reports.caseId, caseId))),
      )
      if (row?.document) Y.applyUpdate(doc, new Uint8Array(row.document))
      sealed = row?.sentAt ?? null
    }

    // **Registered before the first update can land.** `doc.on('update')` is
    // attached here rather than by the caller, so there is no window in which
    // an update is applied to a document nothing is watching.
    const entry: LiveDocument = {
      doc,
      readers: 1,
      timer: null,
      dirty: false,
      unsubscribe: null,
      sealed,
      deciding: null,
      writers: new Map(),
      saving: Promise.resolve(),
    }
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
        this.relayIn(address, entry, payload)
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
  private relayIn(address: ProseRecord, entry: LiveDocument, payload: string): void {
    let frame: Partial<ProseFrame>
    try {
      frame = JSON.parse(payload) as Partial<ProseFrame>
    } catch {
      return
    }
    if (frame.type !== 'prose.document') return
    if (frame.record !== recordOf(address)) return
    if (typeof frame.update !== 'string') return
    if (entry.sealed) return
    if (entry.deciding) {
      entry.deciding.push(() => {
        this.relayIn(address, entry, payload)
      })
      return
    }

    try {
      Y.applyUpdate(entry.doc, new Uint8Array(Buffer.from(frame.update, 'base64')), REMOTE)
    } catch (error) {
      this.log.warn(`dropping a relayed prose update for ${recordOf(address)}: ${String(error)}`)
    }
  }

  /** Empty every fragment of `doc` whose section no longer exists, so a late edit to one is not kept. */
  private async pruneRemovedSections(caseId: string, reportId: string, doc: Y.Doc): Promise<void> {
    const live = await withCase(this.db, caseId, (tx) =>
      tx.select({ id: reportBlocks.id }).from(reportBlocks).where(eq(reportBlocks.reportId, reportId)),
    )
    const kept = new Set(live.map((block) => block.id))
    for (const name of [...doc.share.keys()]) {
      const fragment = fragmentFor(doc, name)
      if (!kept.has(name) && fragment.length > 0) fragment.delete(0, fragment.length)
    }
  }

  /** Empty a removed section's fragment, and store the report without it. Call after its block row is deleted. */
  async clearSection(caseId: string, reportId: string, blockId: string): Promise<void> {
    const address = reportDocument(reportId)
    const doc = await this.open(caseId, address)
    try {
      const fragment = fragmentFor(doc, blockId)
      if (fragment.length === 0) return
      fragment.delete(0, fragment.length)
      await this.flush(caseId, address)
    } finally {
      await this.release(caseId, address)
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

  /** Sets who is told once a flush has stored what somebody wrote. */
  onSaved(listener: Saved): void {
    this.saved = listener
  }

  /**
   * Apply one connection's sync frame, and what to answer it with.
   *
   * Content for a sent report is refused with its stamp. Content arriving while
   * a send decides waits for it: refused if the send stamps, applied if not.
   * Content that changes the document names `writer` in the next flush. The
   * document has to be open.
   */
  async apply(
    caseId: string,
    address: ProseRecord,
    frame: Uint8Array,
    origin: unknown,
    writer: Writer,
  ): Promise<Applied> {
    const holding = this.live.get(keyOf(caseId, address))
    if (!holding) throw new Error(`${recordOf(address)} is not open`)
    const held = await holding
    const deciding = held.deciding
    if ((held.sealed || deciding) && !this.addsNothing(held.doc, frame)) {
      if (held.sealed) return { refused: held.sealed }
      if (deciding) {
        return new Promise((answer) => {
          deciding.push(() => {
            answer(this.apply(caseId, address, frame, origin, writer))
          })
        })
      }
    }
    let changed = false
    const mark = () => {
      changed = true
    }
    held.doc.on('update', mark)
    const reply = this.applySync(held.doc, frame, origin)
    held.doc.off('update', mark)
    if (changed) {
      held.writers.delete(writer.id)
      held.writers.set(writer.id, writer)
    }
    return { reply }
  }

  /**
   * Hold a report's document still while a send decides, once what was typed
   * into it is stored and attributed by `flush`.
   *
   * Takes a reader, which `settle` gives back. A second seal waits for the
   * first to settle. Throws, holding nothing, where that flush fails.
   */
  async seal(caseId: string, reportId: string): Promise<Seal> {
    const address = reportDocument(reportId)
    await this.open(caseId, address)
    const held = await this.live.get(keyOf(caseId, address))!
    while (held.deciding) {
      const waiting = held.deciding
      await new Promise<void>((next) => waiting.push(next))
    }
    held.deciding = []
    await (held.dirty ? this.flush(caseId, address) : held.saving)
    const seal: Seal = {
      bytes: Y.encodeStateAsUpdate(held.doc),
      settle: async (stamp) => {
        if (stamp) {
          // The stamp stored these bytes, and nothing has been applied since.
          held.sealed = stamp
          held.dirty = false
          if (held.timer) clearTimeout(held.timer)
        }
        const waiting = held.deciding ?? []
        held.deciding = null
        for (const go of waiting) go()
        await this.release(caseId, address)
      },
    }
    if (held.dirty) {
      await seal.settle(null)
      throw new Error(`the prose of report ${reportId} could not be stored, so it is not sent`)
    }
    return seal
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

  /**
   * Does this frame carry nothing `doc` does not already hold?
   *
   * Costs a pass over the document, so ask only before a refusal.
   */
  addsNothing(doc: Y.Doc, frame: Uint8Array): boolean {
    if (this.isStateRequest(frame)) return true
    try {
      const decoder = decoding.createDecoder(frame)
      decoding.readVarUint(decoder)
      return Y.snapshotContainsUpdate(Y.snapshot(doc), decoding.readVarUint8Array(decoder))
    } catch {
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
   * Write the document to its row, naming whoever wrote into it since the last
   * write: `updated_by` is the latest of them, and each gets a feed row in the
   * same transaction. Then tells the `onSaved` listener. Resolves once every
   * flush queued before it has run too. Public so a test can force it.
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
    // One at a time: two in flight could store the older document last.
    held.saving = held.saving.then(() => this.store(caseId, address, held))
    await held.saving
  }

  private async store(caseId: string, address: ProseRecord, held: LiveDocument): Promise<void> {
    if (address.table === 'reports') await this.pruneRemovedSections(caseId, address.id, held.doc)
    const bytes = Buffer.from(Y.encodeStateAsUpdate(held.doc))
    const writers = [...held.writers.values()]
    held.writers.clear()
    held.dirty = false
    const by = writers.at(-1)
    const attributed = by ? { updatedBy: by.id, updatedAt: new Date() } : {}
    try {
      await withCase(this.db, caseId, async (tx) => {
        const [row] = await (address.table === 'casenotes'
          ? tx
              .update(caseNotes)
              // **`note` is re-derived from the document on every flush.**
              // The document is the record; the column is the projection the
              // index row, the search and the CSV export read, and a note has
              // no heading to find it by instead. A note's creation writes the
              // column once, as the document's first words; this is its only
              // writer after that.
              .set({ document: bytes, note: noteText(held.doc), ...attributed })
              .where(and(eq(caseNotes.id, address.id), eq(caseNotes.caseId, caseId)))
              .returning({ version: caseNotes.version })
          : tx
              .update(reports)
              .set({ document: bytes, ...attributed })
              .where(and(eq(reports.id, address.id), eq(reports.caseId, caseId)))
              .returning({ version: reports.version }))
        if (!row || writers.length === 0) return
        await tx.insert(changeFeed).values(
          writers.map((writer) => ({
            caseId,
            entity: address.table,
            entityId: address.id,
            op: 'update' as const,
            version: row.version,
            actorId: writer.id,
            fields: address.table === 'casenotes' ? ['document', 'note'] : ['document'],
          })),
        )
      })
      if (writers.length > 0) this.saved?.(caseId, address, writers)
    } catch (error) {
      // Sent by a path this document did not see: nothing more is taken.
      const sent = sentReportIn(error)
      if (sent) {
        held.sealed ??= sent.sentAt
        return
      }
      // **Marked dirty again**, so the next quiet moment or the last reader
      // leaving tries once more. Swallowing it silently is how a report loses
      // an afternoon to a transient database error nobody saw.
      held.dirty = true
      held.writers = new Map([
        ...writers.filter((writer) => !held.writers.has(writer.id)).map((writer) => [writer.id, writer] as const),
        ...held.writers,
      ])
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
