/**
 * A report that has been sent says what it said, after the case moves under it.
 *
 * **And it cannot see a stored tree that is not self-contained.** A freeze
 * holding block ids and resolving them at read time paints correctly while the
 * blocks are there. The last case deletes them.
 */
import { and, asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { cases, impact, reportBlocks, reports, timeline, user } from '../db/schema/index.js'
import { ProseService } from '../prose/prose.service.js'
import { ReportLifecycleService } from './lifecycle.service.js'
import { ReportRenderService } from './render.service.js'
import { english } from './document/packs.js'
import { openTestPool } from '../../test/database.js'
import { EvidenceStore } from '../evidence/store.js'

const noFigures = (): EvidenceStore =>
  new EvidenceStore({ get: () => undefined } as unknown as ConstructorParameters<typeof EvidenceStore>[0])

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

/**
 * Kinds the app builds from the case rather than from what an analyst typed.
 */
const DERIVED_KINDS = ['case_header', 'metrics', 'timeline', 'impact'] as const

describe.skipIf(!db)('a sent report, when the case moves under it', () => {
  let render: ReportRenderService
  let lifecycle: ReportLifecycleService
  let caseId: string
  let actorId: string
  let sentId: string
  let draftId: string

  /**
   * **Compared as a tree, never as its serialisation.**
   */
  const documentOf = async (reportId: string) =>
    (await render.render(caseId, reportId, 'en')).document_

  async function reportOf(label: string): Promise<string> {
    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label, language: 'en', createdBy: actorId })
      .returning()
    for (const [position, kind] of DERIVED_KINDS.entries()) {
      await seed!.insert(reportBlocks).values({
        caseId,
        reportId: report!.id,
        kind,
        heading: '',
        position,
        createdBy: actorId,
      })
    }
    return report!.id
  }

  beforeAll(async () => {
    actorId = 'outlives-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Outlives Analyst',
        email: 'outlives-analyst@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const cases_ = new CasesService(db!, {
      announce: () => {},
      othersOn: () => Promise.resolve([]),
    } as never)
    const row = await cases_.create(
      { title: 'Mailbox exfiltration', severity: 'medium' },
      actorId,
    )
    caseId = row.id

    await seed!.insert(timeline).values({
      caseId,
      kind: 'event',
      time: new Date('2026-02-01T09:00:00.000Z'),
      description: 'First sign-in from an unfamiliar address',
    })
    await seed!.insert(impact).values({
      caseId,
      label: 'One mailbox',
      category: 'personal data',
      disposition: 'exposed',
    })

    const prose = new ProseService(db!)
    render = new ReportRenderService(db!, cases_, prose, englishOnly, noFigures())
    lifecycle = new ReportLifecycleService(
      db!,
      { entry: () => Promise.resolve(undefined) } as never,
      render,
      prose,
    )

    sentId = await reportOf('Filed with the authority')
    draftId = await reportOf('Still being written')
  })

  afterAll(async () => {
    await seed!.delete(cases).where(eq(cases.id, caseId))
    await pool!.end()
  })

  it('draws a section per block before either report is sent', async () => {
    const sent = (await documentOf(sentId)) as { sections: unknown[] }
    expect(sent.sections).toHaveLength(DERIVED_KINDS.length)
  })

  /**
   * The case gains a fact after one report has been filed on it.
   */
  it('holds the filed document unchanged while the draft moves', async () => {
    const filedBefore = await documentOf(sentId)
    const draftBefore = await documentOf(draftId)

    await lifecycle.send(caseId, sentId, actorId, 'en')

    await seed!.insert(timeline).values({
      caseId,
      kind: 'event',
      time: new Date('2026-02-02T11:30:00.000Z'),
      description: 'A second mailbox was reached',
    })
    await seed!.insert(impact).values({
      caseId,
      label: 'A second mailbox',
      category: 'personal data',
      disposition: 'exfiltrated',
    })
    await seed!
      .update(cases)
      .set({ title: 'Mailbox exfiltration, widened', severity: 'high' })
      .where(eq(cases.id, caseId))

    // The control. A draft that did not move means the mutation never reached
    // any section, and the assertion below would hold on a re-rendering server.
    expect(await documentOf(draftId)).not.toEqual(draftBefore)

    const filedAfter = await render.render(caseId, sentId, 'en')
    expect(filedAfter.frozen).toBe(true)
    expect(filedAfter.document_).toEqual(filedBefore)
  })

  /** What was stored is the whole document, not a reference back to the blocks. */
  it('paints the filed report with its own blocks deleted', async () => {
    await seed!
      .delete(reportBlocks)
      .where(and(eq(reportBlocks.caseId, caseId), eq(reportBlocks.reportId, sentId)))

    const remaining = await seed!
      .select()
      .from(reportBlocks)
      .where(and(eq(reportBlocks.caseId, caseId), eq(reportBlocks.reportId, sentId)))
      .orderBy(asc(reportBlocks.position))
    expect(remaining).toHaveLength(0)

    const painted = await render.render(caseId, sentId, 'en')
    expect(painted.frozen).toBe(true)
    expect((painted.document_ as { sections: unknown[] }).sections).toHaveLength(
      DERIVED_KINDS.length,
    )
  })
})
