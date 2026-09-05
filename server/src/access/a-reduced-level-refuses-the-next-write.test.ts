/**
 * Reducing a membership to read refuses the next write and leaves the reading.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CaseAccessGuard } from './case-access.guard.js'
import { GroupsService } from './groups.service.js'
import { ReachService } from './reach.service.js'
import { cases } from '../db/schema/case.js'
import { customers } from '../db/schema/customer.js'
import { groupCustomers, groupMembers, groups } from '../db/schema/groups.js'
import { user } from '../db/schema/auth.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'reduced-level-analyst'
const TITLE = 'What the analyst wrote before the reduction'

const asking = (caseId: string, method: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        params: { caseId },
        method,
        path: `/api/cases/${caseId}`,
        session: { user: { id: ANALYST } },
      }),
    }),
  }) as never

describe.skipIf(!db)('an analyst whose level is reduced while they work', () => {
  let guard: CaseAccessGuard
  let groupsService: GroupsService
  let caseId: string
  let customerId: string
  let sector: string

  beforeAll(async () => {
    guard = new CaseAccessGuard(db!, new ReachService(db!))
    groupsService = new GroupsService(db!)

    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Reduced Level Analyst',
        email: `${ANALYST}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const [customer] = await seed!.insert(customers).values({ name: 'A customer' }).returning()
    customerId = customer!.id
    const [group] = await seed!.insert(groups).values({ name: 'Reducible' }).returning()
    sector = group!.id
    await seed!.insert(groupCustomers).values({ groupId: sector, customerId })

    const [made] = await seed!
      .insert(cases)
      .values({ title: TITLE, customerId, createdBy: ANALYST, updatedBy: ANALYST })
      .returning({ id: cases.id })
    caseId = made!.id

    await groupsService.grant(sector, ANALYST, 'write')
  }, 90_000)

  afterAll(async () => {
    await seed!.delete(cases).where(eq(cases.id, caseId))
    await seed!.delete(groupMembers)
    await seed!.delete(groupCustomers)
    await seed!.delete(groups).where(eq(groups.id, sector))
    await seed!.delete(customers).where(eq(customers.id, customerId))
    await pool!.end()
  })

  it('is writing to the case, which is what the reduction happens to', async () => {
    expect(
      await guard.canActivate(asking(caseId, 'PATCH')),
      'the analyst could not write before the reduction, so nothing below is a reduction',
    ).toBe(true)
  })

  it('is refused the next write once the membership is read', async () => {
    await groupsService.grant(sector, ANALYST, 'read')

    const refused = await guard.canActivate(asking(caseId, 'PATCH')).catch((why: unknown) => why)
    expect(
      refused,
      'the write was served after the level that permitted it was taken away',
    ).not.toBe(true)
    expect(
      refused instanceof ForbiddenException || refused instanceof NotFoundException,
      `the refusal was not a refusal: ${String(refused)}`,
    ).toBe(true)
  })

  it('is still served the reading, so the reduction is not a revocation', async () => {
    expect(await guard.canActivate(asking(caseId, 'GET'))).toBe(true)
  })

  it('leaves what was already written exactly as it was', async () => {
    const [row] = await seed!.select().from(cases).where(eq(cases.id, caseId))
    expect(row!.title, 'the reduction reached back and changed the case').toBe(TITLE)
  })
})
