/**
 * **What is drawn from the case moves when the case moves, and what was
 * written stays as written.**
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { CollectionService } from '../collections/collection.service.js'
import { DEFINITION as TIMELINE } from '../collections/timeline.controller.js'
import { cases, reportBlocks, reports, user } from '../db/schema/index.js'
import { ProseService } from '../prose/prose.service.js'
import { ReportRenderService } from './render.service.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** No language pack: the subject is what moves, not what it is called. */
const englishOnly = {
  translatorFor: () => Promise.resolve((key: string) => key),
  coverageOf: () => Promise.resolve(null),
} as never



describe.skipIf(!db)('a draft report against a case that moves', () => {
  let render: ReportRenderService
  let collections: CollectionService
  let caseId: string
  let reportId: string
  let actorId: string

  beforeAll(async () => {
    const now = new Date()
    actorId = crypto.randomUUID()
    await seed!.insert(user).values({
      id: actorId,
      name: 'Draft Analyst',
      email: `draft-${String(Date.now())}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })

    const [row] = await seed!
      .insert(cases)
      .values({ title: 'A case that moves', createdBy: actorId })
      .returning()
    caseId = row!.id

    collections = new CollectionService(db!)
    render = new ReportRenderService(db!, new CasesService(db!), new ProseService(db!), englishOnly, {
      read: () => Promise.resolve(null),
    } as never)

    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label: 'Draft', createdBy: actorId })
      .returning()
    reportId = report!.id

    await seed!.insert(reportBlocks).values([
      { caseId, reportId, kind: 'timeline', position: 0, createdBy: actorId },
      { caseId, reportId, kind: 'written', position: 1, createdBy: actorId },
    ])
  }, 60_000)

  afterAll(async () => {
    await seed!.delete(cases).where(eq(cases.id, caseId))
    await pool!.end()
    if (seedPool !== pool) await seedPool?.end()
  })

  /** The whole document as text, which is what a reader would compare. */
  async function drawn(): Promise<string> {
    const { document_ } = await render.render(caseId, reportId)
    return JSON.stringify(document_)
  }

  it('presents a timeline entry added after the draft was made', async () => {
    const before = await drawn()
    const marker = `Contained the host ${String(Date.now())}`

    await collections.create(
      TIMELINE,
      caseId,
      { kind: 'action', description: marker, time: new Date() },
      actorId,
    )

    const after = await drawn()

    expect(
      before.includes(marker),
      'the entry was in the document before it was written, which cannot be',
    ).toBe(false)
    expect(
      after.includes(marker),
      'the report did not present a change the case made after the draft existed, so the ' +
        'timeline part is a copy rather than a view',
    ).toBe(true)
  }, 60_000)

  /**
   * **The authored half is not asserted here, and that is deliberate.** A
   * `written` block has no body column -- the prose lives in the CRDT, and
   * `report.ts` says why: *one column, rather than a general body column that
   * would invite the prose back out*. Asserting it wants `ProseService` and a
   * Yjs document, which is a different rig from this one.
   */
  it('leaves the heading the analyst set alone while the case moves', async () => {
    const heading = `Assessment ${String(Date.now())}`
    await seed!
      .update(reportBlocks)
      .set({ heading })
      .where(eq(reportBlocks.reportId, reportId))

    const before = await drawn()
    expect(before.includes(heading), 'the heading never reached the document').toBe(true)

    await collections.create(
      TIMELINE,
      caseId,
      { kind: 'action', description: `Another ${String(Date.now())}`, time: new Date() },
      actorId,
    )

    expect(
      (await drawn()).includes(heading),
      'a case change rewrote what the analyst had put on the block',
    ).toBe(true)
  }, 60_000)
})
