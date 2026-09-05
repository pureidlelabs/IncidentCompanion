/**
 * **Membership is granted and revoked one at a time, and a revocation takes
 * effect for sessions already open** - the last clause of
 * `Case data is reached through groups, at a level`, and the whole of
 * `Reach is withdrawn while the analyst is working`.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GroupsService } from './groups.service.js'
import { ReachService } from './reach.service.js'
import { onReachChanged } from './reach-changed.js'
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

const ANALYST = 'revoked-analyst'
const OTHER = 'untouched-analyst'

afterAll(async () => {
  if (seed) {
    await seed.delete(groupMembers)
    await seed.delete(groupCustomers)
    await seed.delete(groups)
    await seed.delete(customers)
  }
  await pool?.end()
})

describe.skipIf(!db)('a revocation reaches a session already open', () => {
  let service: GroupsService
  let reach: ReachService
  let sector: string
  let theirs: string
  let told: string[]
  let stopListening: () => void

  beforeEach(async () => {
    await seed!.delete(groupMembers)
    await seed!.delete(groupCustomers)
    await seed!.delete(groups)
    await seed!.delete(customers)

    const now = new Date()
    for (const [id, name, email] of [
      [ANALYST, 'Revoked Analyst', 'revoked@example.test'],
      [OTHER, 'Untouched Analyst', 'untouched@example.test'],
    ] as const) {
      await seed!
        .insert(user)
        .values({ id, name, email, emailVerified: true, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
    }

    reach = new ReachService(db!)
    service = new GroupsService(db!)
    await new CustomersService(db!).ensureDefault()

    const [c] = await seed!.insert(customers).values({ name: 'Their sector' }).returning()
    theirs = c!.id
    const [g] = await seed!.insert(groups).values({ name: 'Logistics' }).returning()
    sector = g!.id
    await service.hold(sector, theirs)

    told = []
    stopListening = onReachChanged((userId) => told.push(userId))
  })

  afterEach(() => {
    stopListening()
  })

  it('grants a membership at a level, one at a time', async () => {
    await service.grant(sector, ANALYST, 'read')

    expect(await reach.levelFor(ANALYST, theirs)).toBe('read')
    expect(await reach.levelFor(OTHER, theirs)).toBeNull()
  })

  it('changes a level in place rather than adding a second membership', async () => {
    await service.grant(sector, ANALYST, 'read')
    await service.grant(sector, ANALYST, 'delete')

    expect(await reach.levelFor(ANALYST, theirs)).toBe('delete')
    const held = await seed!.select().from(groupMembers)
    expect(held).toHaveLength(1)
  })

  it('revokes one membership and leaves every other alone', async () => {
    await service.grant(sector, ANALYST, 'write')
    await service.grant(sector, OTHER, 'write')

    await service.revoke(sector, ANALYST)

    expect(await reach.levelFor(ANALYST, theirs)).toBeNull()
    expect(await reach.levelFor(OTHER, theirs)).toBe('write')
  })

  /**
   * The clause this file exists for.
   */
  it.each([
    ['a membership granted', async (s: GroupsService) => s.grant(sector, ANALYST, 'read')],
    ['a level changed', async (s: GroupsService) => s.grant(sector, ANALYST, 'delete')],
    ['a membership revoked', async (s: GroupsService) => s.revoke(sector, ANALYST)],
  ])('announces the analyst on %s', async (_what, act) => {
    await service.grant(sector, ANALYST, 'read')
    told.length = 0

    await act(service)

    expect(told).toContain(ANALYST)
  })

  /**
   * **A customer leaving a group changes reach for everybody in it**, and the
   * scenario names that case directly: *the group that reached it is revoked,
   * or the customer leaves it*.
   */
  it('announces every member when a customer leaves the group', async () => {
    await service.grant(sector, ANALYST, 'read')
    await service.grant(sector, OTHER, 'write')
    told.length = 0

    await service.release(sector, theirs)

    expect([...told].sort()).toEqual([ANALYST, OTHER].sort())
    expect(await reach.levelFor(ANALYST, theirs)).toBeNull()
  })

  /**
   * **Nobody else is announced.**
   */
  it('says nothing about an analyst whose reach did not change', async () => {
    await service.grant(sector, ANALYST, 'read')
    told.length = 0

    await service.grant(sector, ANALYST, 'write')

    expect(told).not.toContain(OTHER)
  })

  it('says nothing when a revocation removed no membership', async () => {
    await service.revoke(sector, ANALYST)

    expect(told).toEqual([])
  })
})
