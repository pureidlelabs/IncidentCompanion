/**
 * Which sections a report is short of.
 */
import { asc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { LibraryService } from '../library/library.service.js'
import { REPORT_LAYOUTS } from '../library/kinds.js'
import { ReportLifecycleService } from './lifecycle.service.js'
import { ReportRenderService } from './render.service.js'
import { ProseService, reportDocument } from '../prose/prose.service.js'
import { cases, library, reportBlocks, reports, timeline, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'
import { english } from './document/packs.js'
import { EvidenceStore } from '../evidence/store.js'

/**
 * A store no test here reads through.
 */
const noFigures = (): EvidenceStore =>
  new EvidenceStore({ get: () => undefined } as unknown as ConstructorParameters<typeof EvidenceStore>[0])

// The packs live in the database; this suite asserts lifecycle, so it renders
// in English and never reads a row.
const englishOnly = {
  translatorFor: () => Promise.resolve(english()),
  coverageOf: () => Promise.resolve(1),
} as never

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** A layout requiring one generated section and one written one. */
const LAYOUT = {
  blocks: [
    { kind: 'impact', required: true },
    { kind: 'written', heading: 'Root cause', required: true },
    { kind: 'timeline', required: false },
  ],
}

/**
 * **A layout written the way the seeder writes one**, which no fixture here
 * was.
 */
const KEYED_LAYOUT = {
  blocks: [
    { kind: 'impact', required: true },
    { kind: 'written', headingKey: 'heading.cross_border_impact', required: true },
  ],
}

describe.skipIf(!db)('the sections a report is short of', () => {
  let lifecycle: ReportLifecycleService
  let cases_: CasesService
  let actorId: string

  async function reportWith(
    template: string,
    blocks: { kind: string; heading?: string; headingKey?: string }[],
  ): Promise<{ caseId: string; reportId: string }> {
    const row = await cases_.create({ title: 'Report under test' }, actorId)
    const [report] = await seed!
      .insert(reports)
      .values({ caseId: row.id, label: 'Under test', template, createdBy: actorId })
      .returning()
    let position = 0
    for (const block of blocks) {
      await seed!.insert(reportBlocks).values({
        caseId: row.id,
        reportId: report!.id,
        kind: block.kind,
        heading: block.heading ?? '',
        headingKey: block.headingKey ?? '',
        position: position++,
        createdBy: actorId,
      })
    }
    return { caseId: row.id, reportId: report!.id }
  }

  beforeAll(async () => {
    actorId = 'report-lifecycle-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Report Lifecycle Analyst',
        email: 'report-lifecycle@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    await seed!.delete(library).where(inArray(library.name, ['under-test', 'under-test-keyed']))
    await seed!
      .insert(library)
      .values([
        {
          kind: REPORT_LAYOUTS,
          name: 'under-test',
          label: 'Under test',
          builtin: true,
          payload: LAYOUT,
        },
        {
          kind: REPORT_LAYOUTS,
          name: 'under-test-keyed',
          label: 'Under test, keyed',
          builtin: true,
          payload: KEYED_LAYOUT,
        },
      ])
      .onConflictDoNothing()

    cases_ = new CasesService(db!, { announce: () => {}, othersOn: () => Promise.resolve([]) } as never)
    // **The real service against the real row.** A stub keyed on the slug the
    // caller passes agrees with whatever the caller spells, which is how a
    // lookup for `layouts` -- a kind no row has ever carried -- passed here for
    // as long as it did.
    const libraryService = new LibraryService(db!, seed)
    const prose = new ProseService(db!)
    const render = new ReportRenderService(db!, cases_, prose, englishOnly, noFigures())
    lifecycle = new ReportLifecycleService(db!, libraryService, render, prose)
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await seed!.delete(library).where(inArray(library.name, ['under-test', 'under-test-keyed']))
  })

  it('does not report a seeded section as missing because its heading was filled in', async () => {
    // The layout leaves `impact`'s heading empty and the block carries the
    // default. Matching on both is what reported a complete report as short of
    // everything it had.
    const { caseId, reportId } = await reportWith('under-test', [
      { kind: 'impact', heading: 'Impact' },
      { kind: 'written', heading: 'Root cause' },
    ])
    expect(await lifecycle.missingSections(caseId, reportId)).toEqual([])
  })

  it('tells two written sections apart by their heading', async () => {
    // Kind alone would make any written section satisfy the requirement, and a
    // report with a "Cross-border impact" section would read as holding a root
    // cause analysis.
    const { caseId, reportId } = await reportWith('under-test', [
      { kind: 'impact' },
      { kind: 'written', heading: 'Cross-border impact' },
    ])
    expect(await lifecycle.missingSections(caseId, reportId)).toEqual([
      { kind: 'written', heading: 'Root cause' },
    ])
  })

  it('ignores a section the layout does not require', async () => {
    const { caseId, reportId } = await reportWith('under-test', [
      { kind: 'impact' },
      { kind: 'written', heading: 'Root cause' },
    ])
    const missing = await lifecycle.missingSections(caseId, reportId)
    expect(missing.map((one) => one.kind)).not.toContain('timeline')
  })

  /**
   * **A report holding nothing is short of everything its layout requires.**
   */
  it('reports every required section of a report holding no blocks at all', async () => {
    const { caseId, reportId } = await reportWith('under-test-keyed', [])
    expect(await lifecycle.missingSections(caseId, reportId)).toEqual([
      { kind: 'impact', heading: '' },
      { kind: 'written', heading: 'heading.cross_border_impact' },
    ])
  })

  /**
   * **And a complete one is short of nothing**, which is the half the spelling
   * broke.
   */
  it('matches a written section the layout identifies by heading key', async () => {
    const { caseId, reportId } = await reportWith('under-test-keyed', [
      { kind: 'impact' },
      { kind: 'written', headingKey: 'heading.cross_border_impact' },
    ])
    expect(await lifecycle.missingSections(caseId, reportId)).toEqual([])
  })

  it('restores a keyed section with its key, not as an untitled block', async () => {
    // The restore has to be idempotent through the key: a block written with an
    // empty `headingKey` satisfies nothing, so every press appends another.
    const { caseId, reportId } = await reportWith('under-test-keyed', [{ kind: 'impact' }])

    const { restored } = await lifecycle.restoreSections(caseId, reportId, actorId)
    expect(restored).toEqual([{ kind: 'written', heading: 'heading.cross_border_impact' }])

    const blocks = await seed!
      .select()
      .from(reportBlocks)
      .where(eq(reportBlocks.reportId, reportId))
    expect(blocks.map((one) => one.headingKey)).toContain('heading.cross_border_impact')
    expect(await lifecycle.missingSections(caseId, reportId)).toEqual([])
  })

  it('requires nothing of a report started from the blank layout', async () => {
    const { caseId, reportId } = await reportWith('__blank__', [])
    expect(await lifecycle.missingSections(caseId, reportId)).toEqual([])
  })

  it('says nothing when the layout has since been deleted', async () => {
    // The analyst removed the file this report started from. The document still
    // stands, and a list of sections nobody can restore is worse than silence.
    const { caseId, reportId } = await reportWith('gone-away', [])
    expect(await lifecycle.missingSections(caseId, reportId)).toEqual([])
  })

  it('refuses a report id belonging to another case', async () => {
    const mine = await reportWith('under-test', [])
    const theirs = await reportWith('under-test', [])
    await expect(
      lifecycle.missingSections(mine.caseId, theirs.reportId),
    ).rejects.toMatchObject({ status: 404 })
  })

  // --------------------------------------------------------------------
  // restore-sections, over the same layout
  // --------------------------------------------------------------------

  it('adds back exactly the sections the layout requires and the report lost', async () => {
    const { caseId, reportId } = await reportWith('under-test', [{ kind: 'impact' }])

    const { restored } = await lifecycle.restoreSections(caseId, reportId, actorId)
    expect(restored).toEqual([{ kind: 'written', heading: 'Root cause' }])
    expect(await lifecycle.missingSections(caseId, reportId)).toEqual([])
  })

  it('restores nothing on a second call', async () => {
    // Idempotent, so the client can offer it without tracking whether it has
    // been pressed. A restore that keyed on the flattened public shape would
    // create a block the next call finds missing all over again, and every
    // press would add another copy.
    const { caseId, reportId } = await reportWith('under-test', [{ kind: 'impact' }])
    await lifecycle.restoreSections(caseId, reportId, actorId)

    const second = await lifecycle.restoreSections(caseId, reportId, actorId)
    expect(second.restored).toEqual([])

    const blocks = await seed!
      .select()
      .from(reportBlocks)
      .where(eq(reportBlocks.reportId, reportId))
    expect(blocks.filter((one) => one.heading === 'Root cause')).toHaveLength(1)
  })

  it('appends past the last section rather than renumbering the document', async () => {
    // A restore that renumbered would reorder a report somebody arranged by
    // hand, and the analyst would read it as the restore having moved things.
    const { caseId, reportId } = await reportWith('under-test', [
      { kind: 'impact' },
      { kind: 'written', heading: 'Findings' },
    ])

    await lifecycle.restoreSections(caseId, reportId, actorId)

    const blocks = await seed!
      .select()
      .from(reportBlocks)
      .where(eq(reportBlocks.reportId, reportId))
      .orderBy(asc(reportBlocks.position))
    expect(blocks.map((one) => one.heading)).toEqual(['', 'Findings', 'Root cause'])
  })

  it('restores nothing to a report whose layout requires nothing', async () => {
    const { caseId, reportId } = await reportWith('__blank__', [])
    expect((await lifecycle.restoreSections(caseId, reportId, actorId)).restored).toEqual([])
  })
})

/**
 * Sending, superseding and repairing a report.
 */
describe.skipIf(!db)('the report lifecycle', () => {
  let lifecycle: ReportLifecycleService
  let render: ReportRenderService
  let prose: ProseService
  let cases_: CasesService
  let actorId: string

  /** A case with a report over it, and the block ids that came back. */
  async function caseWithReport(
    blocks: { kind: string; heading?: string }[],
    report: { label?: string; stage?: string | null; template?: string } = {},
  ) {
    const row = await cases_.create({ title: 'Lifecycle case' }, actorId)
    const [made] = await seed!
      .insert(reports)
      .values({
        caseId: row.id,
        label: report.label ?? 'Under test',
        template: report.template ?? '__blank__',
        stage: report.stage ?? null,
        createdBy: actorId,
      })
      .returning()
    let position = 0
    const ids: string[] = []
    for (const block of blocks) {
      const [block_] = await seed!
        .insert(reportBlocks)
        .values({
          caseId: row.id,
          reportId: made!.id,
          kind: block.kind,
          heading: block.heading ?? '',
          position: position++,
          createdBy: actorId,
        })
        .returning()
      ids.push(block_!.id)
    }
    return { caseId: row.id, reportId: made!.id, blockIds: ids }
  }

  async function addTimelineEntry(caseId: string, description: string): Promise<void> {
    await seed!.insert(timeline).values({
      caseId,
      kind: 'event',
      time: new Date('2026-01-01T00:00:00Z'),
      description,
      createdBy: actorId,
    })
  }

  beforeAll(async () => {
    actorId = 'report-lifecycle-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Report Lifecycle Analyst',
        email: 'report-lifecycle@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    cases_ = new CasesService(
      db!,
      { announce: () => {}, othersOn: () => Promise.resolve([]) } as never,
    )
    const libraryService = { entry: () => Promise.resolve(undefined) } as never
    prose = new ProseService(db!)
    render = new ReportRenderService(db!, cases_, prose, englishOnly, noFigures())
    lifecycle = new ReportLifecycleService(db!, libraryService, render, prose)
  })

  afterAll(async () => {
    await seed!.delete(cases)
  })

  // --------------------------------------------------------------------
  // send
  // --------------------------------------------------------------------

  it('paints a sent report from what it held, not from the case as it is now', async () => {
    // The property the whole freeze exists for. Every generated block derives
    // from the case at render time, so a re-resolve shows a timeline that grew
    // after the document left -- and nobody reading the file can tell.
    const { caseId, reportId } = await caseWithReport([{ kind: 'timeline' }])
    await addTimelineEntry(caseId, 'the event that was reported')

    await lifecycle.send(caseId, reportId, actorId)
    await addTimelineEntry(caseId, 'the event that happened afterwards')

    const painted = await render.render(caseId, reportId)
    const text = JSON.stringify(painted.document_)
    expect(painted.frozen).toBe(true)
    expect(text).toContain('the event that was reported')
    expect(text).not.toContain('the event that happened afterwards')
  })

  /**
   * **The defanger is only worth anything if something calls it**, and nothing
   * did: removing both calls from the render service left this whole suite
   * green, which is how a correct pass ships doing nothing.
   *
   * Asserted on both exits, because a frozen report is painted from its stored
   * tree and never touches the resolver the fresh path goes through.
   */
  it('defangs what it paints, on a fresh report and on a frozen one', async () => {
    const { caseId, reportId } = await caseWithReport([{ kind: 'timeline' }])
    await addTimelineEntry(caseId, 'beaconed to 203.0.113.9 hourly')

    const fresh = await render.render(caseId, reportId)
    expect(fresh.frozen).toBe(false)
    expect(JSON.stringify(fresh.document_)).toContain('203[.]0[.]113[.]9')
    expect(JSON.stringify(fresh.document_)).not.toContain('203.0.113.9')

    await lifecycle.send(caseId, reportId, actorId)
    const sent = await render.render(caseId, reportId)
    expect(sent.frozen).toBe(true)
    expect(JSON.stringify(sent.document_)).toContain('203[.]0[.]113[.]9')
    // Not `[[.]]`: the frozen tree meets the pass again on every read.
    expect(JSON.stringify(sent.document_)).not.toContain('[[.]]')
  })

  it('refuses a second send rather than re-freezing', async () => {
    const { caseId, reportId } = await caseWithReport([{ kind: 'timeline' }])
    await addTimelineEntry(caseId, 'first')
    await lifecycle.send(caseId, reportId, actorId)

    await expect(lifecycle.send(caseId, reportId, actorId)).rejects.toMatchObject({
      status: 409,
      response: { reportId, sentAt: expect.any(String) },
    })
  })

  it('answers the lost race with the stamp the winner wrote', async () => {
    // **The window is real and only reachable here.** `send` reads the row,
    // resolves the document, then writes under `sent_at IS NULL` -- so the
    // only way to be inside it is to stamp the row while the resolve is
    // awaiting, which is what the other analyst's send does. Spying on the
    // render is the interleave; there is no other seam.
    const { caseId, reportId } = await caseWithReport([{ kind: 'timeline' }])
    await addTimelineEntry(caseId, 'first')

    const winnerStamp = new Date('2026-08-12T09:00:00.000Z')
    const real = render.render.bind(render)
    const spy = vi
      .spyOn(render, 'render')
      .mockImplementation(async (...args: Parameters<typeof real>) => {
        const drawn = await real(...args)
        await seed!.update(reports).set({ sentAt: winnerStamp }).where(eq(reports.id, reportId))
        return drawn
      })

    try {
      await expect(lifecycle.send(caseId, reportId, actorId)).rejects.toMatchObject({
        status: 409,
        // The winner's stamp, not this send's own. Reporting the loser's
        // would name a moment at which nothing was filed.
        response: { reportId, sentAt: winnerStamp.toISOString() },
      })
    } finally {
      spy.mockRestore()
    }
  })

  it('counts the version up from the row, not from the copy it read first', async () => {
    // Same window as the lost-race test, with the other analyst *editing*
    // rather than sending. Arithmetic on the pre-render read drives the
    // version backwards, and a client holding the true one is then refused on
    // every later compare -- so the number stops identifying the row's state,
    // which is the whole contract the API publishes for it.
    const { caseId, reportId } = await caseWithReport([{ kind: 'timeline' }])
    await addTimelineEntry(caseId, 'first')

    const [before] = await seed!.select().from(reports).where(eq(reports.id, reportId))
    const real = render.render.bind(render)
    const spy = vi
      .spyOn(render, 'render')
      .mockImplementation(async (...args: Parameters<typeof real>) => {
        const drawn = await real(...args)
        // Two writes, so the gap is wider than an off-by-one and cannot be
        // satisfied by the stale read happening to be one behind.
        await seed!
          .update(reports)
          .set({ label: 'B first', version: before!.version + 1 })
          .where(eq(reports.id, reportId))
        await seed!
          .update(reports)
          .set({ label: 'B second', version: before!.version + 2 })
          .where(eq(reports.id, reportId))
        return drawn
      })

    try {
      await lifecycle.send(caseId, reportId, actorId)
    } finally {
      spy.mockRestore()
    }

    const [after] = await seed!.select().from(reports).where(eq(reports.id, reportId))
    expect(after!.version).toBe(before!.version + 3)
  })

  it('answers a report deleted mid-send with a 404, never with a stamp', async () => {
    // The second reason the conditional update returns nothing, and the one
    // the shared refusal body must not answer: a report that no longer exists
    // has no successor to send the analyst after.
    const { caseId, reportId } = await caseWithReport([{ kind: 'timeline' }])
    await addTimelineEntry(caseId, 'first')

    const real = render.render.bind(render)
    const spy = vi
      .spyOn(render, 'render')
      .mockImplementation(async (...args: Parameters<typeof real>) => {
        const drawn = await real(...args)
        await seed!.delete(reports).where(eq(reports.id, reportId))
        return drawn
      })

    try {
      await expect(lifecycle.send(caseId, reportId, actorId)).rejects.toMatchObject({
        status: 404,
      })
    } finally {
      spy.mockRestore()
    }
  })

  it('leaves the report a draft when a section it holds cannot be drawn', async () => {
    // The state with no way back out: stamped sent, frozen to a document that
    // could not be produced. The resolve has to raise before anything is
    // written, not after.
    //
    // **`figure` was the undrawable kind here until it became drawable**, at
    // which point this would have asserted that a send of a perfectly ordinary
    // report rejects - and it went red rather than quietly passing only
    // because the expectation is a rejection. A kind no build knows is the
    // case that outlives any particular unbuilt resolver.
    const { caseId, reportId } = await caseWithReport([{ kind: 'from-a-later-build' }])

    await expect(lifecycle.send(caseId, reportId, actorId)).rejects.toMatchObject({
      status: 400,
    })

    const [after] = await seed!.select().from(reports).where(eq(reports.id, reportId))
    expect(after!.sentAt).toBeNull()
    expect(after!.frozen).toBeNull()
  })

  it('refuses to send a report belonging to another case', async () => {
    const mine = await caseWithReport([])
    const theirs = await caseWithReport([])
    await expect(
      lifecycle.send(mine.caseId, theirs.reportId, actorId),
    ).rejects.toMatchObject({ status: 404 })
  })

  // --------------------------------------------------------------------
  // supersede
  // --------------------------------------------------------------------

  it("carries the written prose onto the successor's own block ids", async () => {
    // The Node-only trap. The words live in one Yjs document keyed by block
    // id, so a successor with fresh blocks and a byte-copied document renders
    // every written section empty -- the fragments are still filed under ids
    // nothing reads. Python has no equivalent: it carries the words on the row.
    const { caseId, reportId, blockIds } = await caseWithReport([
      { kind: 'written', heading: 'Root cause' },
    ])

    // **A paragraph element, not a bare `Y.XmlText`.** The walker takes only
    // block-level elements from the top of a fragment, so a loose text node
    // resolves to nothing - and a fixture in a shape the editor never produces
    // fails a correct clone, which is what it did here first time.
    const doc = await prose.open(caseId, reportDocument(reportId))
    const para = new Y.XmlElement('paragraph')
    para.insert(0, [new Y.XmlText('a credential was reused')])
    doc.getXmlFragment(blockIds[0]).insert(0, [para])
    await prose.release(caseId, reportDocument(reportId))

    const { id: successor } = await lifecycle.supersede(caseId, reportId, actorId)

    const painted = await render.render(caseId, successor)
    expect(JSON.stringify(painted.document_)).toContain('a credential was reused')
  })

  it('advances the stage one step along the cascade', async () => {
    const { caseId, reportId } = await caseWithReport([], { stage: 'NIS2 early warning' })
    const { id } = await lifecycle.supersede(caseId, reportId, actorId)
    const [fresh] = await seed!.select().from(reports).where(eq(reports.id, id))
    expect(fresh!.stage).toBe('NIS2 notification')
  })

  it('keeps a final report final rather than inventing a fifth stage', async () => {
    const { caseId, reportId } = await caseWithReport([], { stage: 'NIS2 final' })
    const { id } = await lifecycle.supersede(caseId, reportId, actorId)
    const [fresh] = await seed!.select().from(reports).where(eq(reports.id, id))
    expect(fresh!.stage).toBe('NIS2 final')
  })

  it('does not enrol an unstaged report in a regulatory sequence', async () => {
    const { caseId, reportId } = await caseWithReport([], { stage: null })
    const { id } = await lifecycle.supersede(caseId, reportId, actorId)
    const [fresh] = await seed!.select().from(reports).where(eq(reports.id, id))
    expect(fresh!.stage).toBeNull()
  })

  it('leaves the superseded report exactly as it was', async () => {
    const { caseId, reportId } = await caseWithReport([{ kind: 'timeline' }])
    await addTimelineEntry(caseId, 'first')
    await lifecycle.send(caseId, reportId, actorId)
    const [before] = await seed!.select().from(reports).where(eq(reports.id, reportId))

    await lifecycle.supersede(caseId, reportId, actorId)

    const [after] = await seed!.select().from(reports).where(eq(reports.id, reportId))
    expect(after!.sentAt?.toISOString()).toBe(before!.sentAt?.toISOString())
    expect(after!.frozen).toEqual(before!.frozen)
    expect(after!.label).toBe(before!.label)
  })

  it('mints the successor as a draft, whatever the original was', async () => {
    const { caseId, reportId } = await caseWithReport([{ kind: 'timeline' }])
    await addTimelineEntry(caseId, 'first')
    await lifecycle.send(caseId, reportId, actorId)

    const { id } = await lifecycle.supersede(caseId, reportId, actorId)
    const [fresh] = await seed!.select().from(reports).where(eq(reports.id, id))
    expect(fresh!.status).toBe('draft')
    expect(fresh!.sentAt).toBeNull()
    expect(fresh!.frozen).toBeNull()
  })

  it('refuses to repair a report that has already been filed', async () => {
    // The frozen artefact is what left. Adding sections to the live blocks of a
    // filed document produces a report whose sections and whose rendering
    // disagree, and the answer to a filed document being short is a successor.
    const { caseId, reportId } = await caseWithReport([{ kind: 'timeline' }])
    await addTimelineEntry(caseId, 'first')
    await lifecycle.send(caseId, reportId, actorId)

    // **The body, not only the status.** This raised its own string-only
    // conflict while every other refusal of a filed report carried `reportId`
    // and `sentAt` -- so a client rendering "sent at X, open the successor"
    // worked on the write paths and had nothing to read on this one. Asserting
    // the status alone is what let three shapes coexist.
    await expect(
      lifecycle.restoreSections(caseId, reportId, actorId),
    ).rejects.toMatchObject({
      status: 409,
      response: { reportId, sentAt: expect.any(String) },
    })
  })

  it('copies every block, in order, with ids of their own', async () => {
    const { caseId, reportId, blockIds } = await caseWithReport([
      { kind: 'written', heading: 'First' },
      { kind: 'written', heading: 'Second' },
    ])
    const { id } = await lifecycle.supersede(caseId, reportId, actorId)

    const copied = await seed!
      .select()
      .from(reportBlocks)
      .where(eq(reportBlocks.reportId, id))
      .orderBy(asc(reportBlocks.position))
    expect(copied.map((one) => one.heading)).toEqual(['First', 'Second'])
    expect(copied.some((one) => blockIds.includes(one.id))).toBe(false)
  })
})

/**
 * One teardown for the file.
 */
afterAll(async () => {
  if (pool) await pool.end()
})
