/**
 * **Case data is reached through groups, at a level** - the reach model of
 * `openspec/specs/accounts-and-access`.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ReachService, type Level } from './reach.service.js'
import { CustomersService } from '../customers/customers.service.js'
import { customers, groupCustomers, groupMembers, groups, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'reaching-analyst'
const STRANGER = 'unreaching-analyst'

afterAll(async () => {
  if (seed) {
    await seed.delete(groupMembers)
    await seed.delete(groupCustomers)
    await seed.delete(groups)
    await seed.delete(customers)
  }
  await pool?.end()
})

describe.skipIf(!db)('what an analyst reaches, and at what level', () => {
  let reach: ReachService
  let theDefault: string
  let inGroup: string
  let outside: string
  let sector: string

  beforeEach(async () => {
    await seed!.delete(groupMembers)
    await seed!.delete(groupCustomers)
    await seed!.delete(groups)
    await seed!.delete(customers)

    const now = new Date()
    for (const [id, name, email] of [
      [ANALYST, 'Reaching Analyst', 'reaching@example.test'],
      [STRANGER, 'Unreaching Analyst', 'unreaching@example.test'],
    ] as const) {
      await seed!
        .insert(user)
        .values({ id, name, email, emailVerified: true, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
    }

    reach = new ReachService(db!)
    theDefault = (await new CustomersService(db!).ensureDefault()).id

    const [a] = await seed!.insert(customers).values({ name: 'In the sector' }).returning()
    const [b] = await seed!.insert(customers).values({ name: 'Somebody else' }).returning()
    inGroup = a!.id
    outside = b!.id

    const [g] = await seed!.insert(groups).values({ name: 'Logistics' }).returning()
    sector = g!.id
    await seed!.insert(groupCustomers).values({ groupId: sector, customerId: inGroup })
  })

  const join = async (userId: string, groupId: string, level: Level) =>
    seed!.insert(groupMembers).values({ groupId, userId, level })

  /** *A group is built for a sector.* */
  it('reaches every customer in a group it was joined at, and none outside it', async () => {
    await join(ANALYST, sector, 'write')

    expect(await reach.levelFor(ANALYST, inGroup)).toBe('write')
    expect(await reach.levelFor(ANALYST, outside)).toBeNull()
  })

  /**
   * The third clause of that scenario, and the one a per-analyst grant would
   * fail: membership is in the group, so the group's contents move under it.
   */
  it('reaches a customer added to the group later, without touching the analyst', async () => {
    await join(ANALYST, sector, 'read')
    expect(await reach.levelFor(ANALYST, outside)).toBeNull()

    await seed!.insert(groupCustomers).values({ groupId: sector, customerId: outside })

    expect(await reach.levelFor(ANALYST, outside)).toBe('read')
  })

  /** *Two memberships disagree*: the most permissive applies. */
  it('takes the most permissive of two memberships that disagree', async () => {
    const [second] = await seed!.insert(groups).values({ name: 'Incident response' }).returning()
    await seed!.insert(groupCustomers).values({ groupId: second!.id, customerId: inGroup })

    await join(ANALYST, sector, 'read')
    await join(ANALYST, second!.id, 'write')

    expect(await reach.levelFor(ANALYST, inGroup)).toBe('write')
  })

  it('is not fooled by the order the two memberships were made in', async () => {
    const [second] = await seed!.insert(groups).values({ name: 'Incident response' }).returning()
    await seed!.insert(groupCustomers).values({ groupId: second!.id, customerId: inGroup })

    await join(ANALYST, sector, 'delete')
    await join(ANALYST, second!.id, 'read')

    expect(await reach.levelFor(ANALYST, inGroup)).toBe('delete')
  })

  it('reaches nothing but the default when it belongs to no group', async () => {
    expect(await reach.levelFor(STRANGER, inGroup)).toBeNull()
    expect(await reach.levelFor(STRANGER, outside)).toBeNull()
    expect(await reach.customersReachedBy(STRANGER)).toEqual([theDefault])
  })

  /**
   * *The default customer cannot be withheld.* Every analyst reaches it at
   * read and write regardless of groups, and there is no membership to revoke
   * because reaching it was never a membership.
   */
  it('reaches the default customer at read and write, group or no group', async () => {
    expect(await reach.levelFor(STRANGER, theDefault)).toBe('write')

    await join(ANALYST, sector, 'read')
    expect(await reach.levelFor(ANALYST, theDefault)).toBe('write')
  })

  it('lets a group raise the default customer above the floor', async () => {
    await seed!.insert(groupCustomers).values({ groupId: sector, customerId: theDefault })
    await join(ANALYST, sector, 'delete')

    expect(await reach.levelFor(ANALYST, theDefault)).toBe('delete')
  })

  /** And the floor holds under a membership weaker than it. */
  it('does not let a group lower the default customer below the floor', async () => {
    await seed!.insert(groupCustomers).values({ groupId: sector, customerId: theDefault })
    await join(ANALYST, sector, 'read')

    expect(await reach.levelFor(ANALYST, theDefault)).toBe('write')
  })

  /**
   * *A level is reduced while the analyst is working* and *Reach is withdrawn
   * while the analyst is working*, as far as this tier can see them: the
   * answer follows the grant with nothing in between, so there is no cached
   * copy for a session to keep using.
   */
  it('answers from the grant as it is now, not as it was', async () => {
    await join(ANALYST, sector, 'delete')
    expect(await reach.levelFor(ANALYST, inGroup)).toBe('delete')

    await seed!
      .update(groupMembers)
      .set({ level: 'read' })
      .where(eq(groupMembers.userId, ANALYST))
    expect(await reach.levelFor(ANALYST, inGroup)).toBe('read')

    await seed!.delete(groupMembers).where(eq(groupMembers.userId, ANALYST))
    expect(await reach.levelFor(ANALYST, inGroup)).toBeNull()
  })

  it('lists every customer reached, the default among them', async () => {
    await join(ANALYST, sector, 'read')

    const reached = await reach.customersReachedBy(ANALYST)

    expect([...reached].sort()).toEqual([inGroup, theDefault].sort())
  })
})
