/**
 * That the install cannot be left without an administrator, through any door
 * that changes a role: the app's own route, and Better Auth's, which are shut.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

async function pool() {
  const { Pool } = await import('pg')
  return new Pool({ connectionString: process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL })
}

/** Reads roles straight out of Postgres, so no route under test reports on itself. */
async function rolesInDatabase(): Promise<{ id: string; email: string; role: string | null }[]> {
  const db = await pool()
  try {
    const answer = await db.query<{ id: string; email: string; role: string | null }>(
      'select id, email, role from "user" where banned is not true',
    )
    return answer.rows
  } finally {
    await db.end()
  }
}

async function setRoleInDatabase(ids: string[], role: string): Promise<void> {
  if (ids.length === 0) return
  const db = await pool()
  try {
    await db.query('update "user" set role = $1 where id = any($2)', [role, ids])
  } finally {
    await db.end()
  }
}

describe.skipIf(!runnable)('changing a role', () => {
  let harness: Harness
  let admin: Persona
  let adminId = ''

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    adminId = (await rolesInDatabase()).find((one) => one.email === admin.email)?.id ?? ''
    expect(adminId, 'the signed-in administrator must exist').not.toBe('')
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  const asAdmin = (path: string, body: unknown, method = 'POST') =>
    fetch(`${harness.base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify(body),
    })

  /**
   * Runs `body` with this install holding exactly one administrator, and puts
   * every other one back whatever happens.
   *
   * **Taken and returned inside one test.** `vitest.config.mts` sets
   * `fileParallelism: false`, so nothing else is reading while this holds --
   * the `finally` is against an interrupted run rather than a concurrent one.
   */
  async function asTheOnlyAdministrator<T>(body: () => Promise<T>): Promise<T> {
    const parked = (await rolesInDatabase())
      .filter((one) => one.id !== adminId && one.role === 'admin')
      .map((one) => one.id)

    await setRoleInDatabase(parked, 'analyst')
    try {
      return await body()
    } finally {
      // **The subject is restored as well as the parked.** The body is trying
      // to demote it, and a regression is the case where that *works* --
      // restoring only `parked` then leaves the shared install with no
      // administrator at all, for this file and every file after it.
      //
      // **It does not restore the session, and the cascade is smaller rather
      // than gone.** A demotion invalidates the cached session, and writing the
      // role back through the database is behind the app's back, so the cache
      // still says analyst until it expires -- which reddens later cases in
      // this file as 403 where they expect 422. Restoring through the route is
      // not available: the route is what a mutation here breaks.
      await setRoleInDatabase([...parked, adminId], 'admin')
    }
  }

  const roleOf = async (id: string): Promise<string | null | undefined> =>
    (await rolesInDatabase()).find((one) => one.id === id)?.role

  describe('through the app\u2019s own route', () => {
    it('refuses the demotion, and leaves the role alone', async () => {
      await asTheOnlyAdministrator(async () => {
        const answer = await asAdmin(`/api/accounts/${admin.email}/role`, { role: 'analyst' })
        // 422, the same status `POST :username/disable` answers for this rule.
        // A second status for one refusal would be a second thing to keep true.
        expect(answer.status, 'the install would have no administrator left').toBe(422)
        expect(await roleOf(adminId), 'a refusal that half-applied is worse').toBe('admin')

        /**
         * **The scenario asks for two things and this is the second.** *"THEN
         * it is refused AND they are told they are the last."* A status alone
         * lets a bare 422 satisfy the scenario, with the suite agreeing the
         * requirement is met and the administrator told nothing.
         *
         * Asserted on the substance rather than the wording -- it has to name
         * the account and say what to do about it, which is what turns a
         * refusal into something the reader can act on.
         */
        const said = JSON.stringify(await answer.json())
        expect(said).toContain(admin.email)
        expect(said).toContain('last administrator')
        expect(said, 'a refusal that does not say what to do next is a dead end').toContain(
          'Give somebody else the administrator role first',
        )
      })
    })

    /** Or the rule could be "refuse every role change", which strands nobody. */
    it('allows setting the last administrator to administrator again', async () => {
      await asTheOnlyAdministrator(async () => {
        const answer = await asAdmin(`/api/accounts/${admin.email}/role`, { role: 'admin' })
        expect(answer.ok, 'a no-op must not read as a dangerous act').toBe(true)
      })
    })

    /** The shapes a guard reading the body by hand lets through. */
    it.each([
      ['a role this app does not have', { role: 'superuser' }],
      ['a role wrapped in an array', { role: ['analyst'] }],
      ['a role that is not a string', { role: 1 }],
      ['no role at all', {}],
      ['a role with an extra key beside it', { role: 'analyst', userId: 'someone-else' }],
    ])('refuses %s', async (_name, body) => {
      const answer = await asAdmin(`/api/accounts/${admin.email}/role`, body)
      expect(answer.status).toBe(422)
      expect(await roleOf(adminId), 'and writes nothing').toBe('admin')
    })
  })

  /**
   * **The library's own admin routes are closed**, which is what makes the one
   * door above the only door. Each of these demotes the last administrator if
   * `disabledPaths` stops naming it.
   */
  describe('through Better Auth\u2019s admin routes, which are shut', () => {
    it.each([
      ['set-role, plainly', '/api/auth/admin/set-role', { userId: 'PLACEHOLDER', role: 'analyst' }],
      [
        'set-role, with the id wrapped in an array',
        '/api/auth/admin/set-role',
        { userId: ['PLACEHOLDER'], role: 'analyst' },
      ],
      [
        'update-user, which the old guard never matched',
        '/api/auth/admin/update-user',
        { userId: 'PLACEHOLDER', data: { role: 'analyst' } },
      ],
    ])('refuses %s', async (_name, path, shape) => {
      await asTheOnlyAdministrator(async () => {
        const body = JSON.parse(JSON.stringify(shape).replaceAll('PLACEHOLDER', adminId)) as unknown
        const answer = await asAdmin(path, body)

        expect(answer.status, `${path} is served to nobody`).toBe(404)
        expect(await roleOf(adminId), 'and the role is untouched').toBe('admin')
      })
    })
  })
})
