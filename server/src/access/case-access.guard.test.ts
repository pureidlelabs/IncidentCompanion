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
import { cases, customers } from '../db/schema/index.js'
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
   * **Re-anchored: this used to assert the opposite, and the opposite was the
   * defect.** Letting a guarded route with no `caseId` through means a route
   * that spells the parameter anything else is unguarded and silent about it -
   * which is what the compliance routes were. Nothing mounts this guard on a
   * route with no case in its path, so the only thing an absent `caseId` can
   * be is wiring, and a 500 is the loudest thing available to say so.
   */
  it.each([undefined, ''])('refuses when the route names no caseId (%j)', async (caseId) => {
    await expect(guard.canActivate(asking(caseId))).rejects.toMatchObject({ status: 500 })
  })

  /** And it says so before reaching the database, like every other refusal. */
  it('refuses a missing caseId without querying at all', async () => {
    const handle = { select: () => { throw new Error('the guard queried with no case id') } }
    const strict = new CaseAccessGuard(handle as never, new ReachService(handle as never))

    await expect(strict.canActivate(asking(undefined))).rejects.toMatchObject({ status: 500 })
  })
})

/**
 * **The clause #124 decides**: an administrator deletes a case the default
 * customer stands for, holding no group.
 *
 * The third case is the one worth having. A clause reached through the role
 * alone would be a general administrative override, and the difference between
 * that and this is invisible in the two tests that pass either way.
 */
describe.skipIf(!db)('deleting an unattributed case as an administrator', () => {
  let guard: CaseAccessGuard
  let unattributed: string
  let somebody_else_s: string
  let reachedByNobody: string

  /** A request the guard can read, at a role and a method the caller picks. */
  function deleting(caseId: string, role: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { caseId },
          method: 'DELETE',
          // `path`, for the reason `asking` above records: the guard reads it
          // and refuses a request that carries none.
          path: `/api/cases/${caseId}`,
          session: { user: { id: 'nobody-in-any-group', role } },
        }),
      }),
    } as never
  }

  beforeAll(async () => {
    guard = new CaseAccessGuard(db!, new ReachService(db!))
    await new CustomersService(db!).ensureDefault()

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
  })

  it('lets an administrator delete it with no group', async () => {
    await expect(guard.canActivate(deleting(unattributed, ADMIN_ROLE))).resolves.toBe(true)
  })

  /**
   * The floor the default customer guarantees is read and write, so an analyst
   * reaching exactly it is refused - which is what makes the clause a hole in
   * one wall rather than an open door.
   */
  it('refuses the same analyst', async () => {
    await expect(guard.canActivate(deleting(unattributed, 'analyst'))).rejects.toMatchObject({
      status: 403,
    })
  })

  it("does not reach an administrator into another customer's case", async () => {
    await expect(guard.canActivate(deleting(somebody_else_s, ADMIN_ROLE))).rejects.toMatchObject({
      status: 404,
    })
  })
})
