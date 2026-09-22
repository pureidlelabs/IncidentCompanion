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
 * working`: closing a connection whose reach has gone is about a socket that is
 * already up, and these cases drive the admission function rather than a
 * connection. `server/test/reach-withdrawn-ends-what-was-open.test.ts` is where
 * that half is asserted, over a real one.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { LiveGateway, reachesCase } from './live.gateway.js'
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
import { clearCustomers } from '../../test/customers.js'

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
    await clearCustomers(seed)
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
    await clearCustomers(seed!)

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

  const mayReach = (caseId: string, userId: string) => reachesCase(db!, reach, caseId, userId)

  it('admits an analyst whose group holds the case customer', async () => {
    await seed!.insert(groupMembers).values({ groupId: sector, userId: MEMBER, level: 'read' })

    expect(await mayReach(theirCase, MEMBER)).toBe(true)
  })

  /**
   * **The IDOR.** With existence as the whole check, a case belonging to a
   * customer this analyst reaches through no group is admitted -- by a door
   * with no guard on it.
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

  /**
   * A claim is offered only to somebody who could make the edit it announces.
   *
   * **Admission is read; a claim is not**, the same split the prose branch
   * makes -- and a claim is the worse one to get wrong, because
   * `CollectionService` answers a write to a row somebody else holds with a
   * 409. A read-only analyst claiming every row refuses every writer.
   */
  describe('what it lets an analyst claim', () => {
    const ROW = '44444444-4444-4444-8444-444444444444'

    class FakeSocket {
      readonly sent: string[] = []
      private readonly handlers = new Map<string, ((raw: Buffer) => void)[]>()

      send(payload: string): void {
        this.sent.push(payload)
      }
      terminate(): void {}
      on(event: string, handler: (raw: Buffer) => void): this {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
        return this
      }
      receive(frame: Record<string, unknown>): void {
        for (const handler of this.handlers.get('message') ?? []) {
          handler(Buffer.from(JSON.stringify(frame)))
        }
      }
    }

    /**
     * **Polled on the answer, not a count of turns.** The claim branch awaits
     * a real query, so a fixed number of macrotasks is a guess that goes green
     * while asserting nothing.
     */
    const until = (answered: () => number) => vi.waitFor(() => expect(answered()).toBe(1))

    async function socketOn(caseId: string, userId: string) {
      const claimed: { table: string; id: string }[] = []
      const released: { table: string; id: string }[] = []
      const channel = {
        join: () => Promise.resolve(),
        leave: () => Promise.resolve(),
        claim: (_member: unknown, table: string, id: string) => {
          claimed.push({ table, id })
          return Promise.resolve()
        },
        release: (_member: unknown, table: string, id: string) => {
          released.push({ table, id })
          return Promise.resolve()
        },
      }
      const gateway = new LiveGateway(channel as never, {} as never, db!, {} as never, {} as never, reach)
      const live = new FakeSocket()
      await gateway.open(live as never, caseId, { id: userId, name: userId })
      return { live, claimed, released }
    }

    it('refuses a claim from an analyst who may only read the case', async () => {
      await seed!.insert(groupMembers).values({ groupId: sector, userId: MEMBER, level: 'read' })
      const { live, claimed } = await socketOn(theirCase, MEMBER)

      live.receive({ type: 'claim', table: 'systems', id: ROW })
      await until(() => live.sent.length)

      expect(claimed, 'a read-only analyst took a claim, so every writer now meets a 409').toEqual([])
      expect(live.sent.map((payload) => JSON.parse(payload) as unknown)).toEqual([
        { type: 'claim.refused', table: 'systems', id: ROW, reason: 'read-only' },
      ])
    })

    it('takes a claim from an analyst who may write the case', async () => {
      await seed!.insert(groupMembers).values({ groupId: sector, userId: MEMBER, level: 'write' })
      const { live, claimed } = await socketOn(theirCase, MEMBER)

      live.receive({ type: 'claim', table: 'systems', id: ROW })
      await until(() => claimed.length)

      expect(claimed).toEqual([{ table: 'systems', id: ROW }])
      expect(live.sent).toEqual([])
    })

    /**
     * **Release stays open.** `PresenceStore.release` refuses a field held by
     * another session, so the only claim a release can reach is one this
     * connection already owns.
     */
    it('lets a read-only analyst release', async () => {
      await seed!.insert(groupMembers).values({ groupId: sector, userId: MEMBER, level: 'read' })
      const { live, released } = await socketOn(theirCase, MEMBER)

      live.receive({ type: 'release', table: 'systems', id: ROW })
      await until(() => released.length)

      expect(released).toEqual([{ table: 'systems', id: ROW }])
    })
  })
})
