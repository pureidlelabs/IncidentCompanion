/**
 * The prose document: what survives, and what a frame from a browser may reach.
 *
 * **Two failures are worth more than the rest.** Prose that is applied and
 * never written is the one an analyst finds *after* typing an afternoon into
 * it, and a document key that resolves across cases hands one customer's report
 * to another. Everything else here degrades visibly.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as encoding from 'lib0/encoding'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeSyncStep2 } from 'y-protocols/sync'
import * as Y from 'yjs'

import { CasesService } from '../cases/cases.service.js'
import {
  NOTE_FRAGMENT,
  ProseService,
  noteText,
  reportDocument,
  type ProseRelay,
} from './prose.service.js'
import { caseNotes, cases, reports, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/**
 * One client's edit as a raw Yjs update, with the document that made it.
 *
 * Raw, not framed: every caller wraps it in `framed` before the service sees
 * it, and the two are what this file's gate assertions turn on.
 */
function typed(text: string, fragment = 'block-1'): { update: Uint8Array; doc: Y.Doc } {
  const doc = new Y.Doc({ gc: false })
  doc.getXmlFragment(fragment).insert(0, [new Y.XmlText(text)])
  return { update: Y.encodeStateAsUpdate(doc), doc }
}

// **Ended once, for the file.** The pool is shared across every block here, so
// a `describe` that closes it in its own teardown takes the next one down with
// `Cannot use a pool after calling end on the pool` - which reads as a bug in
// the code under test rather than in the harness.
afterAll(async () => {
  if (pool) await pool.end()
})

/**
 * **The codec half needs no database**, and the predicate below is the whole of
 * what stands between a filed report and an edit, so it is asserted on its own
 * rather than only through the socket that calls it.
 */
describe('telling a read from a write', () => {
  const codec = new ProseService({} as never)

  it('calls a step 1 a read and everything else a write', () => {
    expect(codec.isStateRequest(helloFrom(new Y.Doc()))).toBe(true)

    const { update } = typed('text a filed report may not gain')
    expect(codec.isStateRequest(framed(update))).toBe(false)

    // A step 2 carries content exactly as an update does. A client that
    // answered the server's own hello with one would otherwise write through
    // the gate, since only step 1 is the harmless message.
    const answered = encoding.createEncoder()
    writeSyncStep2(answered, typed('and neither may it gain this').doc)
    expect(codec.isStateRequest(encoding.toUint8Array(answered))).toBe(false)
  })

  it('does not call an undecodable frame a read', () => {
    // Empty, so `readVarUint` throws rather than answering 0. Treating the
    // unreadable as harmless would let a truncated update past the gate.
    expect(codec.isStateRequest(new Uint8Array())).toBe(false)
  })
})

describe.skipIf(!db)('the prose document', () => {
  let prose: ProseService
  let cases_: CasesService
  let actorId: string

  async function freshReport(): Promise<{ caseId: string; reportId: string }> {
    const row = await cases_.create({ title: 'Prose under test' }, actorId)
    const [report] = await seed!
      .insert(reports)
      .values({ caseId: row.id, label: 'Under test', createdBy: actorId })
      .returning()
    return { caseId: row.id, reportId: report!.id }
  }

  beforeAll(async () => {
    actorId = 'prose-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Prose Analyst',
        email: 'prose@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    cases_ = new CasesService(db!, {
      announce: () => {},
      othersOn: () => Promise.resolve([]),
    } as never)
    prose = new ProseService(db!)
  })

  afterAll(async () => {
    await seed!.delete(cases)
  })

  describe('two callers opening one report', () => {
    /**
     * **One document per report, however many callers arrive at once.**
     *
     * Two callers inside one row read each build their own `Y.Doc` if the map
     * is written after the await, and the two never converge -- the relay
     * drops a frame from its own instance. One analyst's whole session is then
     * written nowhere, and their tab closing destroys the document the other
     * is still typing into.
     *
     * React StrictMode reaches it alone: it mounts, destroys and re-mounts the
     * channel, so one browser sends two sync frames.
     *
     * **Every other test in this file awaits one open before starting the
     * next**, which is the single ordering that cannot see this.
     * `CaseChannel.subscriptions` holds the same shape for the same reason,
     * storing the promise rather than the settled value.
     */
    it('hands both of them the same document', async () => {
      const { caseId, reportId } = await freshReport()

      const [here, there] = await Promise.all([
        prose.open(caseId, reportDocument(reportId)),
        prose.open(caseId, reportDocument(reportId)),
      ])
      expect(here).toBe(there)

      here.getXmlFragment('block-1').insert(0, [new Y.XmlText('typed by the first analyst')])
      expect(there.getXmlFragment('block-1').toJSON()).toContain('first analyst')

      await prose.release(caseId, reportDocument(reportId))
      expect(there.isDestroyed).toBe(false)
      await prose.release(caseId, reportDocument(reportId))
    })

    it('does not destroy a document a new reader has just taken', async () => {
      const { caseId, reportId } = await freshReport()

      const first = await prose.open(caseId, reportDocument(reportId))
      first.getXmlFragment('block-1').insert(0, [new Y.XmlText('something to flush')])

      const leaving = prose.release(caseId, reportDocument(reportId))
      const second = await prose.open(caseId, reportDocument(reportId))
      await leaving

      expect(second.isDestroyed).toBe(false)
      await prose.release(caseId, reportDocument(reportId))
    })
  })

  describe('what a frame may address', () => {
    it('resolves a report in this case', async () => {
      const { caseId, reportId } = await freshReport()
      expect(await prose.resolve(caseId, `reports:${reportId}:document`)).toEqual({
        table: 'reports',
        id: reportId,
        sentAt: null,
      })
    })

    /**
     * **The state the caller refuses a write on.** `live.gateway` decides per
     * frame whether an update may be applied, and it decides from this - so a
     * `resolve` that answers `sentAt: null` for a filed report reopens the
     * whole door with every one of its own tests still green.
     */
    it('carries when a report was filed', async () => {
      const { caseId, reportId } = await freshReport()
      const sentAt = new Date('2026-08-01T09:30:00.000Z')
      await seed!.update(reports).set({ sentAt }).where(eq(reports.id, reportId))

      const address = await prose.resolve(caseId, `reports:${reportId}:document`)
      expect(address?.sentAt?.toISOString()).toBe(sentAt.toISOString())
    })

    it('refuses a report belonging to another case', async () => {
      // The socket is bound to one case, and a report id from another must
      // miss - otherwise a signed-in analyst reads any report by typing its
      // uuid into a frame.
      //
      // **This asserts the boundary, not one clause holding it.** Deleting the
      // `caseId` comparison in `resolve` leaves this green: row-level security
      // is what refuses the row, and the comparison is the second lock.
      const mine = await freshReport()
      const theirs = await freshReport()
      expect(await prose.resolve(mine.caseId, `reports:${theirs.reportId}:document`)).toBeNull()
    })

    it('refuses a key it does not recognise rather than guessing', async () => {
      const { caseId, reportId } = await freshReport()
      for (const key of [
        `report_blocks:${reportId}:body`,
        `reports:${reportId}:frozen`,
        `reports:${reportId}`,
        'reports:not-a-uuid:document',
        '',
      ]) {
        expect(await prose.resolve(caseId, key), key).toBeNull()
      }
    })
  })

  describe('what survives', () => {
    it('writes the document to its row and reads it back', async () => {
      const { caseId, reportId } = await freshReport()
      const doc = await prose.open(caseId, reportDocument(reportId))
      const { update } = typed('the initial finding was a false positive')
      prose.applySync(doc, framed(update), 'a-socket')
      await prose.flush(caseId, reportDocument(reportId))
      await prose.release(caseId, reportDocument(reportId))

      const [row] = await seed!.select().from(reports).where(eq(reports.id, reportId))
      expect(row!.document).not.toBeNull()

      const reopened = await prose.open(caseId, reportDocument(reportId))
      expect(reopened.getXmlFragment('block-1').toJSON()).toContain('false positive')
      await prose.release(caseId, reportDocument(reportId))
    })

    it('flushes when the last reader leaves, not the first', async () => {
      const { caseId, reportId } = await freshReport()
      const first = await prose.open(caseId, reportDocument(reportId))
      await prose.open(caseId, reportDocument(reportId))

      prose.applySync(first, framed(typed('half a sentence').update), 'a-socket')
      await prose.release(caseId, reportDocument(reportId))

      prose.applySync(first, framed(typed(' and the rest', 'block-2').update), 'a-socket')
      await prose.release(caseId, reportDocument(reportId))

      const reopened = await prose.open(caseId, reportDocument(reportId))
      expect(reopened.getXmlFragment('block-2').toJSON()).toContain('and the rest')
      await prose.release(caseId, reportDocument(reportId))
    })

    it('keeps deleted text, because the document does not collect', async () => {
      // `gc: false` is a property of the record rather than of a session: one
      // collecting peer exports a document with its history already gone, and
      // every later reader inherits the loss.
      const { caseId, reportId } = await freshReport()
      const doc = await prose.open(caseId, reportDocument(reportId))
      expect(doc.gc).toBe(false)
      await prose.release(caseId, reportDocument(reportId))
    })

    it('holds two sections of one report in one document', async () => {
      const { caseId, reportId } = await freshReport()
      const doc = await prose.open(caseId, reportDocument(reportId))
      prose.applySync(doc, framed(typed('summary text', 'block-a').update), 'a')
      prose.applySync(doc, framed(typed('root cause text', 'block-b').update), 'b')
      await prose.flush(caseId, reportDocument(reportId))
      await prose.release(caseId, reportDocument(reportId))

      const reopened = await prose.open(caseId, reportDocument(reportId))
      expect(reopened.getXmlFragment('block-a').toJSON()).toContain('summary')
      expect(reopened.getXmlFragment('block-b').toJSON()).toContain('root cause')
      await prose.release(caseId, reportDocument(reportId))
    })
  })

  describe('the sync exchange', () => {
    it('answers a state vector with what the caller is missing', async () => {
      const { caseId, reportId } = await freshReport()
      const server = await prose.open(caseId, reportDocument(reportId))
      prose.applySync(server, framed(typed('already here').update), 'a')

      const fresh = new Y.Doc({ gc: false })
      const reply = prose.applySync(server, helloFrom(fresh), 'b')
      expect(reply).not.toBeNull()
      await prose.release(caseId, reportDocument(reportId))
    })

    it('says nothing when there is nothing to answer', async () => {
      const { caseId, reportId } = await freshReport()
      const doc = await prose.open(caseId, reportDocument(reportId))
      expect(prose.applySync(doc, framed(typed('typing').update), 'a')).toBeNull()
      await prose.release(caseId, reportDocument(reportId))
    })

    it('drops a frame it cannot read rather than throwing', async () => {
      const { caseId, reportId } = await freshReport()
      const doc = await prose.open(caseId, reportDocument(reportId))
      expect(prose.applySync(doc, new Uint8Array([9, 9, 9, 9]), 'a')).toBeNull()
      await prose.release(caseId, reportDocument(reportId))
    })
  })
})


/**
 * **A case note is a document too, and it is the one with a column beside it.**
 *
 * A report block has nowhere to store its words, so nothing there can disagree
 * with anything. A note keeps `casenotes.note` for its index row, its search
 * hit and its CSV cell - so the two failures worth the most here are the column
 * winning over the document, and a key naming one table reaching the other.
 */
describe.skipIf(!db)('a case note as a live document', () => {
  let prose: ProseService
  let cases_: CasesService
  let actorId: string

  async function freshNote(
    note = '',
    id?: string,
  ): Promise<{ caseId: string; noteId: string }> {
    const row = await cases_.create({ title: 'Notes under test' }, actorId)
    const [made] = await seed!
      .insert(caseNotes)
      .values({ ...(id ? { id } : {}), caseId: row.id, note, createdBy: actorId })
      .returning()
    return { caseId: row.id, noteId: made!.id }
  }

  function wrote(text: string): Uint8Array {
    const doc = new Y.Doc({ gc: false })
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(text)])
    doc.getXmlFragment(NOTE_FRAGMENT).insert(0, [paragraph])
    return Y.encodeStateAsUpdate(doc)
  }

  beforeAll(() => {
    actorId = 'prose-analyst'
    cases_ = new CasesService(db!, {
      announce: () => {},
      othersOn: () => Promise.resolve([]),
    } as never)
    prose = new ProseService(db!)
  })

  afterAll(async () => {
    await seed!.delete(cases)
  })

  describe('what a frame may address', () => {
    /**
     * **`sentAt` has to be null, and asserting the whole object is the point.**
     * `live.gateway` refuses every frame carrying content while the stamp is
     * set, so a `resolve` that put any date there would make every note in the
     * app silently read-only - the text would load, the analyst would type, and
     * nothing would be kept.
     */
    it('resolves a note in this case, with nothing that could freeze it', async () => {
      const { caseId, noteId } = await freshNote()
      expect(await prose.resolve(caseId, `casenotes:${noteId}:document`)).toEqual({
        table: 'casenotes',
        id: noteId,
        sentAt: null,
      })
    })

    it('refuses a note belonging to another case', async () => {
      // A socket is bound to one case, and a note id from another must miss -
      // otherwise a signed-in analyst reads any note in the installation by
      // typing its uuid into a frame.
      //
      // **This asserts the boundary, not one clause holding it.** Deleting
      // the `caseId` comparison from the note branch of `resolve` leaves this
      // file green, because row-level security is what refuses the row and the
      // comparison is the second lock. `refuses a report belonging to another
      // case` records the same result for the same reason.
      const mine = await freshNote()
      const theirs = await freshNote('what the other customer wrote')
      expect(
        await prose.resolve(mine.caseId, `casenotes:${theirs.noteId}:document`),
      ).toBeNull()
    })

    /**
     * **A row id is only meaningful with its table.** Both tables are uuid
     * primary keys, so a frame naming the wrong one is a spelling away - and a
     * lookup that ignored the table would hand a report's document back under a
     * note's key.
     */
    it('does not find a report by asking for it as a note', async () => {
      const row = await cases_.create({ title: 'Both kinds' }, actorId)
      const [report] = await seed!
        .insert(reports)
        .values({ caseId: row.id, label: 'Under test', createdBy: actorId })
        .returning()
      expect(await prose.resolve(row.id, `casenotes:${report!.id}:document`)).toBeNull()

      const [note] = await seed!
        .insert(caseNotes)
        .values({ caseId: row.id, note: 'a note, not a report', createdBy: actorId })
        .returning()
      expect(await prose.resolve(row.id, `reports:${note!.id}:document`)).toBeNull()
    })

    it('refuses a note key naming any column but the document', async () => {
      const { caseId, noteId } = await freshNote('written')
      for (const key of [
        `casenotes:${noteId}:note`,
        `casenotes:${noteId}:author`,
        `casenotes:${noteId}`,
        'casenotes:not-a-uuid:document',
        `case_notes:${noteId}:document`,
      ]) {
        expect(await prose.resolve(caseId, key), key).toBeNull()
      }
    })
  })

  describe('the document is the record and the column follows it', () => {
    it('writes both the document and the words it now holds', async () => {
      const { caseId, noteId } = await freshNote()
      const record = { table: 'casenotes' as const, id: noteId }
      const doc = await prose.open(caseId, record)
      prose.applySync(doc, framed(wrote('the mailbox was read in bulk')), 'a-socket')
      await prose.flush(caseId, record)
      await prose.release(caseId, record)

      const [row] = await seed!.select().from(caseNotes).where(eq(caseNotes.id, noteId))
      expect(row!.document).not.toBeNull()
      expect(row!.note).toBe('the mailbox was read in bulk')
    })

    it('projects a formatted note as plain words', () => {
      const doc = new Y.Doc({ gc: false })
      const paragraph = new Y.XmlElement('paragraph')
      const text = new Y.XmlText()
      text.insert(0, 'exfiltration', { strong: {} })
      paragraph.insert(0, [text])
      doc.getXmlFragment(NOTE_FRAGMENT).insert(0, [paragraph])

      expect(noteText(doc)).toBe('exfiltration')
    })

    it('keeps one line per paragraph, so the opening line stays the opening line', () => {
      const doc = new Y.Doc({ gc: false })
      const fragment = doc.getXmlFragment(NOTE_FRAGMENT)
      for (const line of ['first thing seen', 'second thing seen']) {
        const paragraph = new Y.XmlElement('paragraph')
        paragraph.insert(0, [new Y.XmlText(line)])
        fragment.push([paragraph])
      }
      expect(noteText(doc)).toBe('first thing seen\nsecond thing seen')
    })
  })

  describe('a note that arrived with its words already written', () => {
    it('puts the stored words into the document the first time it is opened', async () => {
      const { caseId, noteId } = await freshNote('imported from the analyst notebook')
      const record = { table: 'casenotes' as const, id: noteId }
      const doc = await prose.open(caseId, record)
      expect(noteText(doc)).toBe('imported from the analyst notebook')
      await prose.release(caseId, record)
    })

    /**
     * **The seeding is a one-way door, and this is the test that matters.**
     * Once a document exists it is the record; re-seeding from the column would
     * let anything that wrote `note` behind the document's back - an import, a
     * bulk PATCH, a hand-run `UPDATE` - reappear on top of what two analysts
     * had typed, with no write having failed.
     */
    it('never re-seeds a document that already exists', async () => {
      const { caseId, noteId } = await freshNote('what it arrived with')
      const record = { table: 'casenotes' as const, id: noteId }

      const first = await prose.open(caseId, record)
      prose.applySync(first, framed(wrote('what an analyst typed')), 'a-socket')
      await prose.flush(caseId, record)
      await prose.release(caseId, record)

      await seed!
        .update(caseNotes)
        .set({ note: 'written straight into the column' })
        .where(eq(caseNotes.id, noteId))

      const reopened = await prose.open(caseId, record)
      expect(noteText(reopened)).toContain('what an analyst typed')
      expect(noteText(reopened)).not.toContain('straight into the column')

      await prose.flush(caseId, record)
      await prose.release(caseId, record)
      const [row] = await seed!.select().from(caseNotes).where(eq(caseNotes.id, noteId))
      expect(row!.note).toContain('what an analyst typed')
    })
  })

  /**
   * **Two tables, one id space.** Both primary keys are uuids, so nothing stops
   * a note and a report sharing one - and a live document held under the row id
   * alone would hand the second caller the first one's document, converging a
   * report and a note into the same words.
   */
  it('holds a note and a report of the same id as two documents', async () => {
    const row = await cases_.create({ title: 'One id, two records' }, actorId)
    const [report] = await seed!
      .insert(reports)
      .values({ caseId: row.id, label: 'Under test', createdBy: actorId })
      .returning()
    await seed!
      .insert(caseNotes)
      .values({ id: report!.id, caseId: row.id, note: '', createdBy: actorId })
      .returning()

    const note = { table: 'casenotes' as const, id: report!.id }
    const asNote = await prose.open(row.id, note)
    const asReport = await prose.open(row.id, reportDocument(report!.id))
    expect(asNote).not.toBe(asReport)

    prose.applySync(asNote, framed(wrote('this belongs to the note')), 'a-socket')
    expect(noteText(asReport)).toBe('')

    await prose.release(row.id, note)
    await prose.release(row.id, reportDocument(report!.id))
  })
})

function framed(update: Uint8Array): Uint8Array {
  return new ProseFrames().update(update)
}

function helloFrom(doc: Y.Doc): Uint8Array {
  return new ProseFrames().hello(doc)
}

/**
 * The two frames a test needs, built with the same codec the service uses so a
 * change of framing breaks both ends together rather than only production.
 */
class ProseFrames {
  private readonly service = new ProseService(null as never)
  update(bytes: Uint8Array): Uint8Array {
    return this.service.frameUpdate(bytes)
  }
  hello(doc: Y.Doc): Uint8Array {
    return this.service.hello(doc)
  }
}

/**
 * A pub/sub with no Redis: every subscriber on the bus hears every publish, in
 * order, which is the only property `ProseService` relies on.
 */
class Bus implements ProseRelay {
  private readonly listeners = new Map<string, Set<(payload: string) => void>>()
  readonly published: string[] = []

  publish(caseId: string, payload: string): Promise<void> {
    this.published.push(payload)
    for (const listener of this.listeners.get(caseId) ?? []) listener(payload)
    return Promise.resolve()
  }

  subscribe(caseId: string, listener: (payload: string) => void): Promise<() => void> {
    const room = this.listeners.get(caseId) ?? new Set<(payload: string) => void>()
    room.add(listener)
    this.listeners.set(caseId, room)
    return Promise.resolve(() => room.delete(listener))
  }
}

describe.skipIf(!db)('two server instances on one report', () => {
  let cases_: CasesService
  let actorId: string

  async function freshReport(): Promise<{ caseId: string; reportId: string }> {
    const row = await cases_.create({ title: 'Two instances' }, actorId)
    const [report] = await seed!
      .insert(reports)
      .values({ caseId: row.id, label: 'Under test', createdBy: actorId })
      .returning()
    return { caseId: row.id, reportId: report!.id }
  }

  beforeAll(() => {
    actorId = 'prose-analyst'
    cases_ = new CasesService(db!, {
      announce: () => {},
      othersOn: () => Promise.resolve([]),
    } as never)
  })

  it('carries an edit made on one instance to the document held by the other', async () => {
    // **This is the job `@hocuspocus/extension-redis` does.** Without it each
    // instance edits a copy the other never sees, and both write their own
    // state over one row - the second analyst's afternoon disappears at the
    // next reload, with nothing having failed.
    const bus = new Bus()
    const one = new ProseService(db!, bus)
    const two = new ProseService(db!, bus)
    const { caseId, reportId } = await freshReport()

    const here = await one.open(caseId, reportDocument(reportId))
    const there = await two.open(caseId, reportDocument(reportId))

    one.applySync(here, framed(typed('written on instance one').update), 'a-socket')

    expect(there.getXmlFragment('block-1').toJSON()).toContain('written on instance one')
    await one.release(caseId, reportDocument(reportId))
    await two.release(caseId, reportDocument(reportId))
  })

  it('turns one edit into one frame, not one per instance holding the document', async () => {
    const bus = new Bus()
    const one = new ProseService(db!, bus)
    const two = new ProseService(db!, bus)
    const { caseId, reportId } = await freshReport()

    const here = await one.open(caseId, reportDocument(reportId))
    await two.open(caseId, reportDocument(reportId))
    bus.published.length = 0

    one.applySync(here, framed(typed('once').update), 'a-socket')

    // One frame: the instance that made the edit. The instance that applied it
    // publishes nothing, because it applied with `REMOTE` - which is the guard
    // that matters. **Deleting the `from` check leaves this green**: a frame
    // returning to its sender is a no-op apply, so that check is a saved round
    // rather than the thing preventing a loop.
    expect(bus.published).toHaveLength(1)
    await one.release(caseId, reportDocument(reportId))
    await two.release(caseId, reportDocument(reportId))
  })

  it('stops listening once its last reader has gone', async () => {
    // A document nobody holds must not keep applying updates: it is not being
    // flushed any more, so the state would only ever diverge from the row.
    const bus = new Bus()
    const one = new ProseService(db!, bus)
    const two = new ProseService(db!, bus)
    const { caseId, reportId } = await freshReport()

    const here = await one.open(caseId, reportDocument(reportId))
    const there = await two.open(caseId, reportDocument(reportId))
    await two.release(caseId, reportDocument(reportId))

    one.applySync(here, framed(typed('after the other left').update), 'a-socket')
    expect(there.getXmlFragment('block-1').toJSON()).not.toContain('after the other left')
    await one.release(caseId, reportDocument(reportId))
  })

  it('is correct for its own sockets with no relay at all', async () => {
    const alone = new ProseService(db!)
    const { caseId, reportId } = await freshReport()
    const doc = await alone.open(caseId, reportDocument(reportId))

    alone.applySync(doc, framed(typed('no relay needed').update), 'a-socket')
    expect(doc.getXmlFragment('block-1').toJSON()).toContain('no relay needed')
    await alone.release(caseId, reportDocument(reportId))
  })
})
