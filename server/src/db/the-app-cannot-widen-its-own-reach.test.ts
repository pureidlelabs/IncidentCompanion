/**
 * **The identity the application connects as cannot take the boundary down.**
 *
 * `state` asks for it directly: *the identity the application connects as MUST
 * NOT be able to bypass that refusal. It MUST NOT be the identity that owns
 * the schema, and MUST NOT hold the privileges that would let it read past a
 * boundary or change the rules that define one.*
 *
 * Row-level security is the whole of the case boundary in this store, so every
 * other guarantee in that requirement rests on `ic_app` being unable to switch
 * it off. Nothing asserted that. `the-store-refuses-an-unscoped-read.test.ts`
 * shows the policies working; this shows they cannot be removed by the role
 * they constrain.
 *
 * **Attempted rather than reasoned about.** A privilege table can be read two
 * ways and a grant can arrive from a role this one inherits, so each escalation
 * is actually run and its refusal is the assertion.
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
    // **Named exactly, and without `if exists`.** A wrong name plus `if
    // exists` is a DROP that succeeds having done nothing, which reads as an
    // escalation that worked. That is how this case first failed.
    ['drop the policy outright', sql`drop policy case_scope on systems`],
    ['grant itself the bypass', sql`alter role ic_app bypassrls`],
    ['become the migrating role', sql`set role ic_migrate`],
  ])('cannot %s', async (_what, statement) => {
    await expect(app!.execute(statement)).rejects.toThrow()
  })

  /**
   * **The boundary is still there afterwards.** Five refusals prove nothing if
   * one of them half-succeeded, and a dropped policy would leave every case's
   * rows readable by the next test in the file.
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
     * subject, and the owner is the migrating role, which has unscoped work to
     * do. What matters for the application is that it is not the owner, which
     * is a case of its own above.
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
