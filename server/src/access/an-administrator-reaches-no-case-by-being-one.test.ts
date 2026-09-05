/**
 * Administering the install does not reach a case, and granting does.
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

const ADMIN = 'plane-separation-admin'

/** What the guard reads, as an administrator asking to read one case. */
const asking = (caseId: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        params: { caseId },
        method: 'GET',
        path: `/api/cases/${caseId}`,
        session: { user: { id: ADMIN, role: 'admin' } },
      }),
    }),
  }) as never

describe.skipIf(!db)('an administrator who is in no group', () => {
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
        id: ADMIN,
        name: 'Plane Separation Admin',
        email: `${ADMIN}@example.test`,
        emailVerified: true,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const [customer] = await seed!.insert(customers).values({ name: 'A customer' }).returning()
    customerId = customer!.id
    const [group] = await seed!.insert(groups).values({ name: 'Nobody is in this' }).returning()
    sector = group!.id
    await seed!.insert(groupCustomers).values({ groupId: sector, customerId })

    /**
     * **Inserted rather than created through `CasesService`.**
     */
    const [made] = await seed!
      .insert(cases)
      .values({
        title: 'A case this admin does not reach',
        customerId,
        createdBy: ADMIN,
        updatedBy: ADMIN,
      })
      .returning({ id: cases.id })
    caseId = made!.id
  }, 90_000)

  afterAll(async () => {
    await seed!.delete(cases).where(eq(cases.id, caseId))
    await seed!.delete(groupMembers)
    await seed!.delete(groupCustomers)
    await seed!.delete(groups).where(eq(groups.id, sector))
    await seed!.delete(customers).where(eq(customers.id, customerId))
    await pool!.end()
  })

  it('is refused the case, being an administrator and nothing else', async () => {
    const refused = await guard.canActivate(asking(caseId)).catch((why: unknown) => why)

    expect(
      refused,
      'an administrator in no group reached a case, so the two planes are one grant',
    ).not.toBe(true)
    expect(
      refused instanceof ForbiddenException || refused instanceof NotFoundException,
      `the refusal was not a refusal: ${String(refused)}`,
    ).toBe(true)
  })

  /**
   * *And they may grant themselves the access and try again.* Deliberate, and
   * the specification says so: the power to manage groups is the power to join
   * one, and the product's answer is the record rather than a restriction.
   */
  it('reaches the same case once it has granted itself the reach', async () => {
    await groupsService.grant(sector, ADMIN, 'read')

    expect(
      await guard.canActivate(asking(caseId)),
      'the grant did not take, so the refusal above cannot be attributed to reach',
    ).toBe(true)
  })

  /**
   * *THEN they stop being served that case* -- the first clause of
   * `Reach is withdrawn while the analyst is working`.
   */
  it('stops reaching it the moment the membership is revoked', async () => {
    expect(
      await guard.canActivate(asking(caseId)),
      'the grant from the previous case did not survive into this one',
    ).toBe(true)

    await groupsService.revoke(sector, ADMIN)

    const refused = await guard.canActivate(asking(caseId)).catch((why: unknown) => why)
    expect(
      refused,
      'the case was still served after the membership that reached it was revoked',
    ).not.toBe(true)
  })
})
