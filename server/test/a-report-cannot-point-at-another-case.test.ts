/**
 * A report section cannot be made to carry another case's evidence.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CollectionService } from '../src/collections/collection.service.js'
import { REPORT_BLOCKS_COLLECTION } from '../src/collections/entities.controller.js'
import { cases } from '../src/db/schema/case.js'
import { evidence } from '../src/db/schema/entities.js'
import { reports } from '../src/db/schema/report.js'
import { user } from '../src/db/schema/auth.js'
import { openTestPool } from './database.js'

const ANALYST = 'cross-case-analyst'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

let service: CollectionService
let theirCase = ''
let ourCase = ''
let theirEvidence = ''
let ourEvidence = ''
let ourReport = ''

describe.skipIf(!db)('a report section naming evidence', () => {
  beforeAll(async () => {
    service = new CollectionService(db!)

    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Cross Case Analyst',
        email: `${ANALYST}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const [theirs] = await seed!
      .insert(cases)
      .values({ title: 'A case belonging to another customer', createdBy: ANALYST, updatedBy: ANALYST })
      .returning({ id: cases.id })
    theirCase = theirs!.id
    const [ours] = await seed!
      .insert(cases)
      .values({ title: 'The case being reported on', createdBy: ANALYST, updatedBy: ANALYST })
      .returning({ id: cases.id })
    ourCase = ours!.id

    const [alien] = await seed!
      .insert(evidence)
      .values({ caseId: theirCase, name: 'Their screenshot' })
      .returning({ id: evidence.id })
    theirEvidence = alien!.id
    const [mine] = await seed!
      .insert(evidence)
      .values({ caseId: ourCase, name: 'Our screenshot' })
      .returning({ id: evidence.id })
    ourEvidence = mine!.id

    const [report] = await seed!
      .insert(reports)
      .values({ caseId: ourCase, label: 'The report', language: 'en', createdBy: ANALYST })
      .returning({ id: reports.id })
    ourReport = report!.id
  }, 90_000)

  afterAll(async () => {
    await seed!.delete(cases).where(eq(cases.id, theirCase))
    await seed!.delete(cases).where(eq(cases.id, ourCase))
    await pool!.end()
  })

  it('takes a figure naming evidence from its own case', async () => {
    const made = (await service.create(
      REPORT_BLOCKS_COLLECTION,
      ourCase,
      { reportId: ourReport, kind: 'figure', position: 0, evidenceId: ourEvidence },
      ANALYST,
    )) as { id: string }

    expect(made.id, 'a figure could not be made at all, so the refusal below proves nothing').toBeDefined()
  })

  it('refuses a figure naming evidence from another case', async () => {
    const refused = await service
      .create(
        REPORT_BLOCKS_COLLECTION,
        ourCase,
        { reportId: ourReport, kind: 'figure', position: 1, evidenceId: theirEvidence },
        ANALYST,
      )
      .then(() => null)
      .catch((why: unknown) => why)

    expect(
      refused,
      'a report section was made carrying evidence from another case, so a report can be ' +
        'exported holding a row the analyst was never shown',
    ).not.toBeNull()
  })

  it('wrote no such row, whatever it answered', async () => {
    const held = await seed!
      .select({ id: evidence.id })
      .from(evidence)
      .where(eq(evidence.id, theirEvidence))

    expect(held, 'the fixture evidence is gone, so the case above tested nothing').toHaveLength(1)
  })
})
