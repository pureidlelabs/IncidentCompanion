/**
 * **The two merge scenarios that turn on reach**, which `two-customers-are-one`
 * had to leave alone because there were no groups yet.
 *
 * *A merge MUST move everything the losing customer held*, and what it held
 * includes being in groups. Nobody's reach is granted over a customer
 * directly, so moving the group edges is the whole of it - a merge that moved
 * only the cases would leave an analyst reaching the survivor at whatever the
 * survivor's groups gave them and silently losing the rest.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { CustomersService } from './customers.service.js'
import { ReachService } from '../access/reach.service.js'
import { cases, customers, groupCustomers, groupMembers, groups, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'reaching-merger'

afterAll(async () => {
  if (seed) {
    await seed.delete(cases)
    await seed.delete(groupMembers)
    await seed.delete(groupCustomers)
    await seed.delete(groups)
    await seed.delete(customers)
  }
  await pool?.end()
})

describe.skipIf(!db)('what an analyst reaches after a merge', () => {
  let service: CustomersService
  let reach: ReachService
  let losing: string
  let surviving: string
  let theirs: string
  let ours: string

  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(groupMembers)
    await seed!.delete(groupCustomers)
    await seed!.delete(groups)
    await seed!.delete(customers)

    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Reaching Merger',
        email: 'reaching-merger@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    service = new CustomersService(db!)
    reach = new ReachService(db!)
    await service.ensureDefault()

    // The two answer every organisation fact the same way, so no merge here
    // needs a choice and none of these cases is about the disagreement rule.
    const [a] = await seed!.insert(customers).values({ name: 'Northwind BV' }).returning()
    const [b] = await seed!.insert(customers).values({ name: 'Northwind B.V.' }).returning()
    losing = a!.id
    surviving = b!.id

    const [g] = await seed!.insert(groups).values({ name: 'Held the losing one' }).returning()
    const [h] = await seed!.insert(groups).values({ name: 'Held the surviving one' }).returning()
    theirs = g!.id
    ours = h!.id
    await seed!.insert(groupCustomers).values({ groupId: theirs, customerId: losing })
    await seed!.insert(groupCustomers).values({ groupId: ours, customerId: surviving })
  })

  const join = async (groupId: string, level: 'read' | 'write' | 'delete') =>
    seed!.insert(groupMembers).values({ groupId, userId: ANALYST, level })

  /**
   * *Reach after a merge*: an analyst who reached only the losing record
   * reaches the survivor, and the cases that came with it.
   */
  it('reaches the survivor through the group that held the one that went', async () => {
    await join(theirs, 'write')
    const [row] = await seed!
      .insert(cases)
      .values({ title: 'Came across', customerId: losing })
      .returning()
    expect(await reach.levelFor(ANALYST, surviving), 'reached the survivor already').toBeNull()

    await service.merge({ losing, surviving, choices: {}, actorId: ANALYST })

    expect(await reach.levelFor(ANALYST, surviving)).toBe('write')
    const [moved] = await seed!
      .select({ customerId: cases.customerId })
      .from(cases)
      .where(eq(cases.id, row!.id))
    expect(moved!.customerId).toBe(surviving)
  })

  /**
   * *An analyst reaches both sides of a merge at different levels*: the
   * survivor is reached at the stronger, and **the merge grants nothing
   * neither side already gave them**.
   */
  it('reaches the survivor at the stronger of the two levels held', async () => {
    await join(theirs, 'read')
    await join(ours, 'write')

    await service.merge({ losing, surviving, choices: {}, actorId: ANALYST })

    expect(await reach.levelFor(ANALYST, surviving)).toBe('write')
  })

  it('is not fooled by which side held the stronger level', async () => {
    await join(theirs, 'delete')
    await join(ours, 'read')

    await service.merge({ losing, surviving, choices: {}, actorId: ANALYST })

    expect(await reach.levelFor(ANALYST, surviving)).toBe('delete')
  })

  /**
   * **The clause a moved edge could quietly break.** Somebody who reached
   * neither record must reach nothing afterwards - a merge that granted the
   * survivor to everybody in any group would satisfy every case above.
   */
  it('grants nothing to somebody who reached neither', async () => {
    await service.merge({ losing, surviving, choices: {}, actorId: ANALYST })

    expect(await reach.levelFor(ANALYST, surviving)).toBeNull()
  })

  /**
   * A group that already held both sides ends with one edge, not two. The pair
   * is the primary key, so a second insert would fail the merge outright.
   */
  it('survives a group that already held both', async () => {
    await seed!.insert(groupCustomers).values({ groupId: theirs, customerId: surviving })
    await join(theirs, 'read')

    await service.merge({ losing, surviving, choices: {}, actorId: ANALYST })

    const edges = await seed!
      .select()
      .from(groupCustomers)
      .where(eq(groupCustomers.customerId, surviving))
    expect(edges.filter((one) => one.groupId === theirs)).toHaveLength(1)
    expect(await reach.levelFor(ANALYST, surviving)).toBe('read')
  })

  /** Nothing is left pointing at a record that is gone. */
  it('leaves no group holding the customer that went', async () => {
    await join(theirs, 'read')

    await service.merge({ losing, surviving, choices: {}, actorId: ANALYST })

    const orphaned = await seed!
      .select()
      .from(groupCustomers)
      .where(eq(groupCustomers.customerId, losing))
    expect(orphaned).toEqual([])
  })
})
