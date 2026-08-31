/**
 * The guard in front of every case route, attacked at the id it is handed.
 *
 * **A guard runs before the pipes, so it validates or nothing does.** With the
 * check here removed, `/api/cases/undefined/...` answers 500 from Postgres
 * refusing the cast - never the 400 the route's `ParseUUIDPipe` declares.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CaseAccessGuard } from './case-access.guard.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/** The shape a guard reads, and nothing else it might reach for. */
function asking(caseId: string | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params: caseId ? { caseId } : {} }) }),
  } as never
}

describe.skipIf(!db)('the guard in front of a case', () => {
  let guard: CaseAccessGuard

  beforeAll(() => {
    guard = new CaseAccessGuard(db!)
  })

  afterAll(async () => {
    await pool!.end()
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
    const strict = new CaseAccessGuard(handle as never)

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
    const strict = new CaseAccessGuard(handle as never)

    await expect(strict.canActivate(asking(undefined))).rejects.toMatchObject({ status: 500 })
  })
})
