/**
 * **The identity the application connects as cannot take the boundary down.**
 */
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, describe, expect, it } from 'vitest'

import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const app = pool ? drizzle({ client: pool }) : null

/** A case-scoped table, and the one every other case-owned table is shaped like. */
const SCOPED = 'systems'

describe.skipIf(!app)('the identity the application connects as', () => {
  afterAll(async () => {
    await pool!.end()
  })

  /**
   * The vacuity guard, and it is the premise of every case below: a role that
   * could not reach the table at all would refuse these for the wrong reason.
   */
  it('can read the table it is being refused control of', async () => {
    await expect(
      app!.execute(sql`select 1 from systems limit 1`),
      'the app role cannot read the table, so the refusals below say nothing about privilege',
    ).resolves.toBeDefined()
  })

  it('does not own the table it reads', async () => {
    const found = await app!.execute(sql`
      select tableowner::text as owner from pg_tables
      where schemaname = 'public' and tablename = ${SCOPED}
    `)
    const owner = (found.rows[0] as { owner?: string } | undefined)?.owner

    expect(owner, 'no such table, so this asserts nothing').toBeDefined()
    expect(
      owner,
      'the application owns the schema it serves, and an owner is exempt from row-level ' +
        'security unless it is forced -- so the boundary would be its own to lift',
    ).not.toBe('ic_app')
  })

  it('holds no attribute that would let it read past a boundary', async () => {
    const found = await app!.execute(sql`
      select rolbypassrls, rolsuper, rolcreaterole, rolcreatedb
      from pg_roles where rolname = current_user
    `)
    const role = found.rows[0] as Record<string, boolean> | undefined

    expect(role, 'the current role is not in pg_roles, which cannot be').toBeDefined()
    expect(
      { ...role },
      'the app role carries an attribute that lifts or reassigns the boundary',
    ).toEqual({
      rolbypassrls: false,
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
    })
  })

  /**
   * The escalations themselves. Each is a way to remove the case boundary
   * rather than to work around one row of it, and each must be refused.
   */
  it.each([
    ['disable row-level security', sql`alter table systems disable row level security`],
    ['stop forcing it on the owner', sql`alter table systems no force row level security`],
    ['add a column nothing scopes', sql`alter table systems add column probe_widened text`],
    ['make a table of its own', sql`create table probe_widened (id uuid primary key)`],
    // **Named exactly, and without `if exists`.** A wrong name plus `if
    // exists` is a DROP that succeeds having done nothing, which reads as an
    // escalation that worked. That is how this case first failed.
    ['drop the policy outright', sql`drop policy case_scope on systems`],
    ['grant itself the bypass', sql`alter role ic_app bypassrls`],
    ['become the migrating role', sql`set role ic_migrate`],
  ])('cannot %s', async (what, statement) => {
    /**
     * **The SQLSTATE, not merely that it threw.**
     */
    const thrown = (await app!
      .execute(statement)
      .then(() => null)
      .catch((error: unknown) => error)) as
      | { code?: string; message?: string; cause?: { code?: string } }
      | null

    expect(thrown, `the app role was allowed to ${what}`).toBeTruthy()

    // Drizzle wraps the driver's error, so the SQLSTATE is on the cause.
    const code = thrown!.code ?? thrown!.cause?.code

    expect(
      code,
      `${what} was refused for some reason other than privilege (${String(thrown!.message)}), ` +
        'so this case is no longer about what the role may do',
    ).toBe('42501')
  })

  /**
   * **The boundary is still there afterwards.**
   */
  it('still has row-level security on, and still has the policy, after all of that', async () => {
    const table = await app!.execute(sql`
      select relrowsecurity from pg_class where relname = ${SCOPED}
    `)
    expect(
      (table.rows[0] as { relrowsecurity?: boolean } | undefined)?.relrowsecurity,
      'row-level security is off after the attempts above',
    ).toBe(true)

    /**
     * `FORCE` is deliberately not asserted: it decides whether the *owner* is
     * subject, and the owner is the migrating role, which has unscoped work to do.
     */
    const policies = await app!.execute(sql`
      select policyname::text as name from pg_policies
      where schemaname = 'public' and tablename = ${SCOPED}
    `)
    expect(
      (policies.rows as { name: string }[]).map((one) => one.name),
      'the case-scoping policy is gone, so one of the attempts above succeeded',
    ).toContain('case_scope')
  })
})
