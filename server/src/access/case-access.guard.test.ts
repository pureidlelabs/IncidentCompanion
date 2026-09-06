/**
 * The guard in front of every case route, attacked at the id it is handed.
 *
 * **A guard runs before the pipes, so it validates or nothing does.** With the
 * check here removed, `/api/cases/undefined/...` answers 500 from Postgres
 * refusing the cast - never the 400 the route's `ParseUUIDPipe` declares.
 */
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CaseAccessGuard } from './case-access.guard.js'
import { ReachService } from './reach.service.js'
import { ADMIN_ROLE } from '../auth/auth.config.js'
import { CustomersService } from '../customers/customers.service.js'
import { cases, customers, groupCustomers, groupMembers, groups, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

// **File level, not inside the first block.** Both describes share the pool,
// and closing it in one of them leaves the other querying a dead handle.
afterAll(async () => {
  await pool?.end()
})

/**
 * The shape a guard reads, and nothing else it might reach for.
 *
 * The method, the URL and the session are what the level check needs; every
 * case here refuses before reaching it, and they are supplied so that a case
 * which stopped refusing would fail on the assertion rather than on a missing
 * field.
 */
function asking(caseId: string | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: caseId ? { caseId } : {},
        method: 'GET',
        // **`path`, because that is what the guard reads.** Supplying only
        // `originalUrl` left this fixture asserting its own docstring falsely:
        // every case here refuses before the level is derived, so the suite
        // stayed green while a case that *stopped* refusing would have hit the
        // no-parsed-path 500 and still looked like a refusal.
        path: `/api/cases/${caseId ?? ''}`,
        session: { user: { id: 'somebody' } },
      }),
    }),
  } as never
}

describe.skipIf(!db)('the guard in front of a case', () => {
  let guard: CaseAccessGuard

  beforeAll(() => {
    guard = new CaseAccessGuard(db!, new ReachService(db!))
  })

  /**
   * **`undefined` is the one that shipped**, because a client that builds a
   * URL from a missing field spells it exactly that way.
   */
  it.each(['undefined', 'null', 'not-a-uuid', '1', '../etc/passwd'])(
    'answers 400 rather than 500 for the case id %j',
    async (caseId) => {
      await expect(guard.canActivate(asking(caseId))).rejects.toMatchObject({ status: 400 })
    },
  )

  /**
   * **The database is never asked.** A malformed id that reaches the query is
   * what produced the 500, so the property is that it stops before it - and a
   * refusal that merely *reads* as 400 while still hitting Postgres would pass
   * a status-only assertion.
   */
  it('refuses without querying at all', async () => {
    const handle = { select: () => { throw new Error('the guard queried a malformed id') } }
    const strict = new CaseAccessGuard(handle as never, new ReachService(handle as never))

    await expect(strict.canActivate(asking('undefined'))).rejects.toMatchObject({ status: 400 })
  })

  it('still answers 404 for a well-formed id that names no case', async () => {
    await expect(
      guard.canActivate(asking('00000000-0000-4000-8000-000000000000')),
    ).rejects.toMatchObject({ status: 404 })
  })

  /**
   * **A guarded route with no `caseId` is wiring, not a caller's mistake.**
   * Letting one through means a route that spells the parameter anything else
   * is unguarded and silent about it. Nothing mounts this guard on a
   * route with no case in its path, so the only thing an absent `caseId` can
   * be is wiring, and a 500 is the loudest thing available to say so.
   */
  it.each([undefined, ''])('refuses when the route names no caseId (%j)', async (caseId) => {
    await expect(guard.canActivate(asking(caseId))).rejects.toMatchObject({ status: 500 })
  })

  it('refuses a missing caseId without querying at all', async () => {
    const handle = { select: () => { throw new Error('the guard queried with no case id') } }
    const strict = new CaseAccessGuard(handle as never, new ReachService(handle as never))

    await expect(strict.canActivate(asking(undefined))).rejects.toMatchObject({ status: 500 })
  })
})

/**
 * **The floor the default customer guarantees answers to the role**, so an
 * administrator in no group reaches `delete` over it and an analyst reaches
 * write.
 *
 * **The role is not in the request.** It is read where reach is resolved, so
 * these drive the guard with real accounts: a session that carried a role
 * would be asserting against a value this test invented rather than against
 * the one the resolution uses.
 *
 * The third case is the one worth having. A floor reached through the role
 * alone would be a general administrative override, and the difference is
 * invisible in the two that pass either way.
 */
describe.skipIf(!db)('the default customer floor, by role', () => {
  let guard: CaseAccessGuard
  let unattributed: string
  let somebody_else_s: string
  let reachedByNobody: string

  const ADMIN = 'floor-admin'
  const ANALYST = 'floor-analyst'

  function deleting(caseId: string, who: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { caseId },
          method: 'DELETE',
          path: `/api/cases/${caseId}`,
          session: { user: { id: who } },
        }),
      }),
    } as never
  }

  beforeAll(async () => {
    guard = new CaseAccessGuard(db!, new ReachService(db!))
    await new CustomersService(db!).ensureDefault()

    const now = new Date()
    for (const [id, role] of [
      [ADMIN, ADMIN_ROLE],
      [ANALYST, 'analyst'],
    ] as const) {
      await db!
        .insert(user)
        .values({
          id,
          role,
          name: id,
          email: `${id}@example.test`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
    }

    const [mine] = await db!.insert(cases).values({ title: 'Nobody has said whose' }).returning()
    unattributed = mine!.id

    const [held] = await db!
      .insert(customers)
      .values({ name: `Reached by nobody ${String(Date.now())}` })
      .returning()
    reachedByNobody = held!.id
    const [theirs] = await db!
      .insert(cases)
      .values({ title: 'Attributed, and not to me', customerId: held!.id })
      .returning()
    somebody_else_s = theirs!.id
  })

  // The cases first: the foreign key is `restrict`, so the customer cannot go
  // while one stands behind it.
  afterAll(async () => {
    await db!.delete(cases).where(inArray(cases.id, [unattributed, somebody_else_s]))
    await db!.delete(customers).where(eq(customers.id, reachedByNobody))
    await db!.delete(user).where(inArray(user.id, [ADMIN, ANALYST]))
  })

  it('lets an administrator delete it with no group', async () => {
    await expect(guard.canActivate(deleting(unattributed, ADMIN))).resolves.toBe(true)
  })

  /**
   * An analyst reaches the floor at write, so the level is what refuses them
   * rather than the route.
   */
  it('refuses the same deletion to an analyst', async () => {
    await expect(guard.canActivate(deleting(unattributed, ANALYST))).rejects.toMatchObject({
      status: 403,
    })
  })

  it("does not reach an administrator into another customer's case", async () => {
    await expect(guard.canActivate(deleting(somebody_else_s, ADMIN))).rejects.toMatchObject({
      status: 404,
    })
  })

  /**
   * **The resolution and the guard answer the same level.** Two readers that
   * disagree is the failure the single-resolution requirement names, and it is
   * what a clause inside the guard would have produced.
   */
  it('answers the same level to anyone who asks the resolution', async () => {
    const reach = new ReachService(db!)
    const fallback = (await reach.defaultCustomerId())!

    expect(await reach.levelFor(ADMIN, fallback)).toBe('delete')
    expect(await reach.levelFor(ANALYST, fallback)).toBe('write')
    expect(await reach.levelFor(ADMIN, reachedByNobody)).toBeNull()
  })

  /**
   * **A floor rather than a ceiling.** Reading it as a cap would mean nobody
   * could ever be given delete over an unattributed case, which is the reading
   * the specification does not support.
   */
  it('lets a group raise an analyst above the floor', async () => {
    const reach = new ReachService(db!)
    const fallback = (await reach.defaultCustomerId())!

    const [sector] = await db!
      .insert(groups)
      .values({ name: `Above the floor ${String(Date.now())}` })
      .returning()
    try {
      await db!.insert(groupCustomers).values({ groupId: sector!.id, customerId: fallback })
      await db!
        .insert(groupMembers)
        .values({ groupId: sector!.id, userId: ANALYST, level: 'delete' })

      expect(await reach.levelFor(ANALYST, fallback)).toBe('delete')
      await expect(guard.canActivate(deleting(unattributed, ANALYST))).resolves.toBe(true)
    } finally {
      await db!.delete(groupMembers).where(eq(groupMembers.groupId, sector!.id))
      await db!.delete(groupCustomers).where(eq(groupCustomers.groupId, sector!.id))
      await db!.delete(groups).where(eq(groups.id, sector!.id))
    }
  })
})
