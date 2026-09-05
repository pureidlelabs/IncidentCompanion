/**
 * Giving somebody reach leaves a line naming all five things it must name.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CustomersService } from '../customers/customers.service.js'
import { GroupsController } from './groups.controller.js'
import { GroupsService } from './groups.service.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { groupCustomers, groupMembers, groups } from '../db/schema/groups.js'
import { customers } from '../db/schema/customer.js'
import { installActivity } from '../db/schema/install-activity.js'
import { user } from '../db/schema/auth.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ADMIN = 'recorded-grant-admin'
const ANALYST = 'recorded-grant-analyst'

const caller = { user: { id: ADMIN, name: 'Recorded Admin' } } as never
const request = { headers: {} } as never

describe.skipIf(!db)('an analyst being given reach', () => {
  let controller: GroupsController
  let sector: string

  const account = async (id: string, name: string) => {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id,
        name,
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }

  beforeAll(async () => {
    controller = new GroupsController(new GroupsService(db!), new InstallActivityService(db!))
    await new CustomersService(db!).ensureDefault()
    await account(ADMIN, 'Recorded Admin')
    await account(ANALYST, 'Recorded Analyst')
  }, 90_000)

  /**
   * Every `reach_granted` line the table holds.
   */
  const grantLines = () =>
    seed!.select().from(installActivity).where(eq(installActivity.event, 'reach_granted'))

  const since = async (before: { id: string }[]) => {
    const seen = new Set(before.map((one) => one.id))
    return (await grantLines()).filter((one) => !seen.has(one.id))
  }

  beforeEach(async () => {
    await seed!.delete(groupMembers)
    await seed!.delete(groupCustomers)
    await seed!.delete(groups)

    const [made] = await seed!.insert(groups).values({ name: 'Logistics' }).returning()
    sector = made!.id
  })

  afterAll(async () => {
    await seed!.delete(groupMembers)
    await seed!.delete(groupCustomers)
    await seed!.delete(groups)
    await seed!.delete(customers)
    await pool!.end()
  })

  it('writes exactly one line, and it is the grant', async () => {
    const already = await grantLines()
    const before = new Date()
    await controller.grant(sector, { userId: ANALYST, level: 'delete' }, caller, request)

    const lines = await since(already)
    expect(lines, 'the grant left no line in the table at all').toHaveLength(1)

    const line = lines[0]!
    const detail = (line.detail ?? {}) as Record<string, unknown>

    expect(
      {
        administrator: line.actorId,
        analyst: line.targetLabel,
        group: detail['groupId'],
        level: detail['level'],
      },
      'the line does not carry all four of the facts the record is read for',
    ).toEqual({
      administrator: ADMIN,
      analyst: ANALYST,
      group: sector,
      level: 'delete',
    })

    /**
     * The fifth.
     */
    expect(line.at.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    expect(line.at.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  /**
   * **Two grants are two lines, each naming its own group.** One line carrying
   * the wrong group is what a shared or overwritten `detail` looks like, and a
   * single-grant case cannot see it.
   */
  it('keeps the group apart when the same analyst is granted twice', async () => {
    const [other] = await seed!.insert(groups).values({ name: 'Incident response' }).returning()
    const already = await grantLines()

    await controller.grant(sector, { userId: ANALYST, level: 'read' }, caller, request)
    await controller.grant(other!.id, { userId: ANALYST, level: 'write' }, caller, request)

    const pairs = (await since(already))
      .map((one) => {
        const detail = (one.detail ?? {}) as Record<string, unknown>
        return `${String(detail['groupId'])}:${String(detail['level'])}`
      })
      .sort()

    expect(pairs, 'the two grants are not recorded as two distinct facts').toEqual(
      [`${sector}:read`, `${other!.id}:write`].sort(),
    )
  })

  it('records nothing when the grant itself is refused', async () => {
    const already = await grantLines()

    await expect(
      controller.grant(sector, { userId: ANALYST, level: 'root' }, caller, request),
    ).rejects.toMatchObject({ status: 422 })

    expect(
      await since(already),
      'a refused grant was recorded as though it had happened',
    ).toHaveLength(0)
  })
})
