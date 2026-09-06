/**
 * **A report that fails to render is not marked sent.**
 *
 * `report` puts it as a consequence of the larger rule -- *sending MUST record
 * that the report was sent and preserve what was sent, and these MUST be one
 * act* -- because the alternative is *the state nobody can recover from: the
 * document has left, and the application cannot say what it contained*.
 *
 * The order in `send` is what makes it true: it renders, and only then stamps.
 * Nothing asserted that order, and reversing it would leave every existing
 * test in `freeze.test.ts` green -- they all render successfully, so a stamp
 * written first is never observed.
 *
 * **A real renderer cannot be told to fail**, so the one here is a stand-in
 * that rejects, which is the only way to ask what happens when the document
 * cannot be produced.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cases, reports, user } from '../db/schema/index.js'
import { ProseService } from '../prose/prose.service.js'
import { ReportLifecycleService } from './lifecycle.service.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const cannotRender = {
  render: () => Promise.reject(new Error('the document cannot be produced')),
} as never

describe.skipIf(!db)('a report that cannot be rendered', () => {
  let lifecycle: ReportLifecycleService
  let caseId: string
  let reportId: string
  let actorId: string

  beforeAll(async () => {
    const now = new Date()
    actorId = crypto.randomUUID()
    await seed!.insert(user).values({
      id: actorId,
      name: 'Send Analyst',
      email: `send-${String(Date.now())}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })

    const [row] = await seed!
      .insert(cases)
      .values({ title: 'A report that will not render', createdBy: actorId })
      .returning()
    caseId = row!.id

    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label: 'Unsendable', createdBy: actorId })
      .returning()
    reportId = report!.id

    lifecycle = new ReportLifecycleService(
      db!,
      { entry: () => Promise.resolve(undefined) } as never,
      cannotRender,
      new ProseService(db!),
    )
  }, 60_000)

  afterAll(async () => {
    await seed!.delete(cases).where(eq(cases.id, caseId))
    await pool!.end()
    if (seedPool !== pool) await seedPool?.end()
  })

  it('is not stamped sent, and the send does not report success', async () => {
    const before = await seed!.select().from(reports).where(eq(reports.id, reportId))
    expect(before[0]?.sentAt, 'the report was already sent, so this proves nothing').toBeNull()

    await expect(
      lifecycle.send(caseId, reportId, actorId, 'en'),
      'sending reported success for a document that was never produced',
    ).rejects.toThrow()

    const after = await seed!.select().from(reports).where(eq(reports.id, reportId))

    expect(
      after[0]?.sentAt,
      'the report is stamped sent and nothing was preserved, which is the state the ' +
        'requirement calls unrecoverable: the document has left and the application ' +
        'cannot say what it contained',
    ).toBeNull()
  }, 60_000)

  /**
   * The other half of *one act*: nothing was preserved either. A stamp with no
   * document and a document with no stamp are both the window the requirement
   * closes, and only the pair rules out each.
   */
  it('preserves no document for a send that failed', async () => {
    const [row] = await seed!.select().from(reports).where(eq(reports.id, reportId))

    expect(
      row?.document,
      'a document was preserved for a report that never rendered',
    ).toBeFalsy()
  }, 60_000)
})
