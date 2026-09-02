/**
 * **The socket asks the same question a route does**, because nothing asks it
 * for the socket.
 *
 * No guard, pipe, middleware or interceptor runs on an upgrade, so every check
 * a route gets for free is re-implemented by hand here - and a check that was
 * added to `CaseAccessGuard` and not to this gateway is a case reachable over
 * a socket by somebody the API refuses.
 *
 * `mayReach` was written as its own method for exactly this, and said so:
 * *the day that lands, this is where it lands - rather than being missed
 * because a socket is not a route and no guard runs on it.*
 *
 * **The half this cannot assert** is `Reach is withdrawn while the analyst is
 * working`: closing a connection whose reach has gone needs the membership
 * write to announce it, and there is no route that changes a membership yet.
 * Admission is the half that exists.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { reachesCase } from './live.gateway.js'
import { ReachService } from '../access/reach.service.js'
import { CustomersService } from '../customers/customers.service.js'
import {
  cases,
  customers,
  groupCustomers,
  groupMembers,
  groups,
  user,
} from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const MEMBER = 'socket-member'
const STRANGER = 'socket-stranger'

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

describe.skipIf(!db)('the socket asks reach too', () => {
  let reach: ReachService
  let theirCase: string
  let unattributed: string
  let theirCustomer: string
  let sector: string

  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(groupMembers)
    await seed!.delete(groupCustomers)
    await seed!.delete(groups)
    await seed!.delete(customers)

    const now = new Date()
    for (const [id, name, email] of [
      [MEMBER, 'Socket Member', 'socket-member@example.test'],
      [STRANGER, 'Socket Stranger', 'socket-stranger@example.test'],
    ] as const) {
      await seed!
        .insert(user)
        .values({ id, name, email, emailVerified: true, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
    }

    reach = new ReachService(db!)
    await new CustomersService(db!).ensureDefault()

    const [c] = await seed!.insert(customers).values({ name: 'Somebody else' }).returning()
    theirCustomer = c!.id
    const [g] = await seed!.insert(groups).values({ name: 'Their sector' }).returning()
    sector = g!.id
    await seed!.insert(groupCustomers).values({ groupId: sector, customerId: theirCustomer })

    const [theirs] = await seed!
      .insert(cases)
      .values({ title: "Somebody else's", customerId: theirCustomer })
      .returning()
    const [nobodys] = await seed!.insert(cases).values({ title: 'Nobody has said' }).returning()
    theirCase = theirs!.id
    unattributed = nobodys!.id
  })

  /**
   * The gateway's own question, driven without building a gateway: the other
   * four collaborators have nothing to do with reach, and supplying them would
   * make this assert through a channel and an audit writer.
   */
  const mayReach = (caseId: string, userId: string) => reachesCase(db!, reach, caseId, userId)

  it('admits an analyst whose group holds the case customer', async () => {
    await seed!.insert(groupMembers).values({ groupId: sector, userId: MEMBER, level: 'read' })

    expect(await mayReach(theirCase, MEMBER)).toBe(true)
  })

  /**
   * **The one the gateway could not previously refuse.** Existence was the
   * whole check, so a case belonging to a customer this analyst reaches
   * through no group was admitted - by a door with no guard on it.
   */
  it('refuses an analyst who reaches the case customer through no group', async () => {
    expect(await mayReach(theirCase, STRANGER)).toBe(false)
  })

  /**
   * A case nobody has attributed belongs to the default customer, which every
   * analyst reaches - so the socket admits it, exactly as the API does.
   */
  it('admits anybody to a case nobody has attributed', async () => {
    expect(await mayReach(unattributed, STRANGER)).toBe(true)
  })

  it('refuses a case that does not exist, as it always did', async () => {
    expect(await mayReach('00000000-0000-4000-8000-000000000000', MEMBER)).toBe(false)
  })

  /**
   * **Read is enough to watch and no more is required.** A socket only ever
   * shows what a case holds, so demanding write here would lock a read-only
   * analyst out of the screen they are entitled to.
   */
  it('admits at read, the weakest level there is', async () => {
    await seed!.insert(groupMembers).values({ groupId: sector, userId: MEMBER, level: 'read' })

    expect(await reach.levelFor(MEMBER, theirCustomer)).toBe('read')
    expect(await mayReach(theirCase, MEMBER)).toBe(true)
  })

  /**
   * Answered from the grant as it stands, so a membership removed while the
   * connection is being made is not admitted on a stale answer. Closing one
   * already open is the half that needs a membership route to announce it.
   */
  it('follows the grant rather than a copy of it', async () => {
    await seed!.insert(groupMembers).values({ groupId: sector, userId: MEMBER, level: 'read' })
    expect(await mayReach(theirCase, MEMBER)).toBe(true)

    await seed!.delete(groupMembers).where(eq(groupMembers.userId, MEMBER))

    expect(await mayReach(theirCase, MEMBER)).toBe(false)
  })
})
