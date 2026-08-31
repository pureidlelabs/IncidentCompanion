/**
 * The door, where the contract can be wrong while the service is right.
 *
 * **Inherited from the resume routes this replaces**, whose own test kept two
 * properties no service test can see: that a body missing its field is refused
 * rather than treated as null, and that an unknown key is refused rather than
 * dropped. The service is handed values and writes them faithfully either way.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { pinSchema, visitSchema, RecentController } from './recent.controller.js'
import { RecentService } from './recent.service.js'
import { caseVisits, cases, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const SAM = 'recent-ctl-sam'
const session = { user: { id: SAM } } as never

describe.skipIf(!db)('the recent-cases routes', () => {
  let controller: RecentController
  let caseId: string

  beforeEach(async () => {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: SAM,
        name: SAM,
        email: `${SAM}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    await seed!.delete(caseVisits)
    await seed!.delete(cases)
    const [row] = await seed!
      .insert(cases)
      .values({ title: 'At the door', createdBy: SAM, updatedBy: SAM })
      .returning({ id: cases.id })
    caseId = row!.id
    controller = new RecentController(new RecentService(db!))
  })

  afterAll(async () => {
    await seed!.delete(caseVisits)
    await seed!.delete(cases)
    await pool!.end()
  })

  /**
   * **Absent and null are different answers.** A missing `section` under a
   * lenient schema would be written as "they reached no section", quietly
   * losing where the analyst was on every navigation the client got wrong.
   *
   * **Asserted against the schema, because that is where the rule now lives.**
   * The route takes a DTO, so the global pipe refuses a bad body before any
   * handler sees it - and a unit test calling the method directly bypasses the
   * pipe entirely, which would leave this and the two below unable to fail.
   * That the pipe is wired at all is the HTTP sweep's to prove.
   */
  it('refuses a visit body with no section at all', () => {
    expect(visitSchema.safeParse({}).success).toBe(false)
    expect(visitSchema.safeParse({ section: 'timeline' }).success).toBe(true)
  })

  it('accepts an explicit null section, which is a real state', async () => {
    await controller.visit(caseId, { section: null }, session)

    expect((await controller.list(session)).recent[0]).toMatchObject({ caseId, section: null })
  })

  it('refuses a field the shape does not have', () => {
    expect(visitSchema.safeParse({ section: 'timeline', pinned: true }).success).toBe(false)
  })

  /** `pinned` is a boolean, and a string that reads as one is not it. */
  it('refuses a pin body that is not a boolean', () => {
    expect(pinSchema.safeParse({ pinned: 'true' }).success).toBe(false)
    expect(pinSchema.safeParse({ pinned: true }).success).toBe(true)
  })

  it('pins and unpins through the route', async () => {
    await controller.pin(caseId, { pinned: true }, session)
    expect((await controller.list(session)).pinned.map((r) => r.caseId)).toEqual([caseId])

    await controller.pin(caseId, { pinned: false }, session)
    expect((await controller.list(session)).pinned).toEqual([])
  })

  it('forgets through the route without touching the case', async () => {
    await controller.visit(caseId, { section: 'timeline' }, session)
    await controller.forget(caseId, session)

    expect((await controller.list(session)).recent).toEqual([])
    expect(await seed!.select().from(cases)).toHaveLength(1)
  })
})
