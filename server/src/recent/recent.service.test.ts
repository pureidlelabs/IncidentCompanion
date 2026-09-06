/**
 * The cases an analyst has been in.
 *
 * **Four properties are under attack**: that two analysts never see each
 * other's, that pinning survives visiting, that the tail is pruned without
 * taking a pin with it, and that the order is by *when* rather than by
 * whatever Postgres felt like returning.
 */
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { RECENT_LIMIT, RecentService } from './recent.service.js'
import { caseVisits, cases, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/** `ic_seed`, because a fixture writes cases and the app role may not. */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const SAM = 'recent-sam'
const ALEX = 'recent-alex'

describe.skipIf(!db)('the cases an analyst has been in', () => {
  let service: RecentService

  async function aCase(title: string): Promise<string> {
    const [row] = await seed!
      .insert(cases)
      .values({ title, createdBy: SAM, updatedBy: SAM })
      .returning({ id: cases.id })
    return row!.id
  }

  beforeEach(async () => {
    const now = new Date()
    for (const id of [SAM, ALEX]) {
      await seed!
        .insert(user)
        .values({
          id,
          name: id,
          email: `${id}@example.test`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
    }
    await seed!.delete(caseVisits)
    await seed!.delete(cases)
    service = new RecentService(db!)
  })

  afterAll(async () => {
    await seed!.delete(caseVisits)
    await seed!.delete(cases)
    await pool!.end()
  })

  /**
   * **Joining is the reason this is a table rather than a stored string.** The
   * title, the reference and the state all come back in the same read, with no
   * second request and nothing cached to go stale when the case is renamed.
   */
  it('names the case, and follows a rename', async () => {
    const id = await aCase('Ransomware at Contoso')
    await service.visit(SAM, id, 'actions')

    expect((await service.list(SAM)).recent[0]).toMatchObject({
      caseId: id,
      title: 'Ransomware at Contoso',
      section: 'actions',
      status: 'open',
      pinned: false,
    })

    await seed!.update(cases).set({ title: 'Renamed' }).where(eq(cases.id, id))
    expect((await service.list(SAM)).recent[0]?.title).toBe('Renamed')
  })

  it('keeps one row per case, however often it is opened', async () => {
    const id = await aCase('Twice')
    await service.visit(SAM, id, 'timeline')
    await service.visit(SAM, id, 'actions')

    const { recent } = await service.list(SAM)
    expect(recent).toHaveLength(1)
    expect(recent[0]?.section).toBe('actions')
  })

  it('orders by when they were last there, newest first', async () => {
    const first = await aCase('First')
    const second = await aCase('Second')
    await service.visit(SAM, first, 'timeline')
    await service.visit(SAM, second, 'timeline')
    await service.visit(SAM, first, 'evidence')

    expect((await service.list(SAM)).recent.map((r) => r.caseId)).toEqual([first, second])
  })

  it('does not show one analyst what another has been in', async () => {
    const mine = await aCase('Mine')
    await service.visit(SAM, mine, 'timeline')

    expect((await service.list(ALEX)).recent).toEqual([])
  })

  describe('pinning', () => {
    it('lifts a case out of the recent list and into the pinned one', async () => {
      const id = await aCase('Pinned')
      await service.visit(SAM, id, 'actions')
      await service.pin(SAM, id, true)

      const { pinned, recent } = await service.list(SAM)
      expect(pinned.map((r) => r.caseId)).toEqual([id])
      expect(recent.map((r) => r.caseId)).toEqual([])
    })

    it('survives being visited again', async () => {
      const id = await aCase('Still pinned')
      await service.visit(SAM, id, 'actions')
      await service.pin(SAM, id, true)
      await service.visit(SAM, id, 'evidence')

      const { pinned } = await service.list(SAM)
      expect(pinned).toHaveLength(1)
      expect(pinned[0]?.section).toBe('evidence')
    })

    /**
     * **Pinning something never visited is a real path.** The picker offers a
     * pin on a case in the list, which an analyst may never have opened.
     */
    it('pins a case with no visit behind it', async () => {
      const id = await aCase('Never opened')
      await service.pin(SAM, id, true)

      expect((await service.list(SAM)).pinned.map((r) => r.caseId)).toEqual([id])
    })

    it('unpins back into the recent list, keeping where they were', async () => {
      const id = await aCase('Unpinned')
      await service.visit(SAM, id, 'impact')
      await service.pin(SAM, id, true)
      await service.pin(SAM, id, false)

      const { pinned, recent } = await service.list(SAM)
      expect(pinned).toEqual([])
      expect(recent[0]).toMatchObject({ caseId: id, section: 'impact' })
    })

    it('orders pins by when they were pinned, newest first', async () => {
      const first = await aCase('Pinned first')
      const second = await aCase('Pinned second')
      await service.pin(SAM, first, true)
      await service.pin(SAM, second, true)

      expect((await service.list(SAM)).pinned.map((r) => r.caseId)).toEqual([second, first])
    })
  })

  describe('the tail', () => {
    it(`keeps the newest ${String(RECENT_LIMIT)} and forgets the rest`, async () => {
      const ids: string[] = []
      for (let i = 0; i <= RECENT_LIMIT; i += 1) {
        const id = await aCase(`Case ${String(i)}`)
        ids.push(id)
        await service.visit(SAM, id, 'timeline')
      }

      const { recent } = await service.list(SAM)
      expect(recent).toHaveLength(RECENT_LIMIT)
      expect(recent.map((r) => r.caseId)).not.toContain(ids[0])
    })

    /**
     * Visits made in the same millisecond must still have an order - the
     * assertion the prune test above cannot make, because it waits for the
     * arbitrary order to land the wrong way.
     */
    it('orders visits made inside one millisecond by when they happened', async () => {
      const made: string[] = []
      for (let i = 0; i < 6; i += 1) {
        const id = await aCase(`Rapid ${String(i)}`)
        made.push(id)
        await service.visit(SAM, id, 'timeline')
      }

      const { recent } = await service.list(SAM)
      const seen = recent.map((row) => row.caseId).filter((id) => made.includes(id))

      /**
       * **Newest-first, exactly reversed from the order they were visited.**
       *
       * A millisecond-resolution stamp ties across visits made this close
       * together, and `order by visitedAt desc` then returns tied rows in
       * whatever order Postgres chooses. The prune reads the same order, so a
       * tie there deletes a row that is not the oldest.
       */
      expect(seen, 'the rail is not newest-first for visits inside one millisecond').toEqual(
        [...made].reverse(),
      )

      // Read from Postgres rather than through the API, which renders a stamp
      // with `toISOString()` and hides the microseconds this is about.
      const stamps = await db!
        .select({ at: caseVisits.visitedAt, caseId: caseVisits.caseId })
        .from(caseVisits)
        .where(eq(caseVisits.userId, SAM))
      const mine = made.map((id) => stamps.find((row) => row.caseId === id)?.at?.getTime())
      expect(mine.every((at) => at !== undefined), 'a visit is missing its row').toBe(true)

      const microseconds = await db!.execute<{ ordered: boolean }>(
        // `getTime()` above is milliseconds and would tie exactly as the API
        // does, so the strict-increase check has to happen in the database.
        // Column references come from the schema: the database spells these
        // `visited_at` and `user_id`, and a hardcoded camelCase name is a
        // 42703 rather than a wrong answer.
        sql`select bool_and(gap > interval '0') as ordered from (
              select ${caseVisits.visitedAt}
                     - lag(${caseVisits.visitedAt}) over (order by ${caseVisits.visitedAt})
                       as gap
              from ${caseVisits} where ${eq(caseVisits.userId, SAM)}
            ) steps where gap is not null`,
      )
      expect(
        microseconds.rows[0]?.ordered,
        'two visits share a timestamp, so the rail and the prune are ordering ' +
          'tied rows by whatever Postgres returns',
      ).toBe(true)

      /**
       * Sub-millisecond resolution is the half that cannot pass by luck, and
       * strict increase alone is not a deterministic guard.
       *
       * This pins the resolution, not the function: `now()` leaves it green,
       * which is correct - `visit()` runs once per transaction and cannot tie
       * in the shape that ships.
       */
      const resolution = await db!.execute<{ sub: number }>(
        sql`select count(*)::int as sub from ${caseVisits}
            where ${eq(caseVisits.userId, SAM)}
              and (extract(microseconds from ${caseVisits.visitedAt})::bigint % 1000) <> 0`,
      )
      expect(
        resolution.rows[0]?.sub,
        'every visit stamp is a whole millisecond, so the write lost ' +
          'sub-millisecond resolution and ties are back',
      ).toBeGreaterThan(0)
    })

    it('never prunes a pinned case, however old the visit', async () => {
      const kept = await aCase('Pinned and old')
      await service.visit(SAM, kept, 'timeline')
      await service.pin(SAM, kept, true)

      for (let i = 0; i <= RECENT_LIMIT; i += 1) {
        await service.visit(SAM, await aCase(`Filler ${String(i)}`), 'timeline')
      }

      expect((await service.list(SAM)).pinned.map((r) => r.caseId)).toEqual([kept])
    })

    it('prunes per analyst, not across the table', async () => {
      const theirs = await aCase("Alex's")
      await service.visit(ALEX, theirs, 'timeline')

      for (let i = 0; i <= RECENT_LIMIT; i += 1) {
        await service.visit(SAM, await aCase(`Filler ${String(i)}`), 'timeline')
      }

      expect((await service.list(ALEX)).recent.map((r) => r.caseId)).toEqual([theirs])
    })
  })

  describe('forgetting', () => {
    it('drops one case from the list without touching the case itself', async () => {
      const id = await aCase('Forget me')
      await service.visit(SAM, id, 'timeline')

      await service.forget(SAM, id)

      expect((await service.list(SAM)).recent).toEqual([])
      expect(await seed!.select().from(cases).where(eq(cases.id, id))).toHaveLength(1)
    })

    it('loses the visit when the case is deleted', async () => {
      const id = await aCase('Deleted')
      await service.visit(SAM, id, 'timeline')

      await seed!.delete(cases).where(eq(cases.id, id))

      expect(await seed!.select().from(caseVisits).where(and(eq(caseVisits.userId, SAM)))).toEqual(
        [],
      )
      expect((await service.list(SAM)).recent).toEqual([])
    })
  })
})
