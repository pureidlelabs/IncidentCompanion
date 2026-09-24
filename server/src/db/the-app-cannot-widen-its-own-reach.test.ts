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
 * it off. Nothing asserted that. `the-store-refuses-what-its-caller-does-not-reach.test.ts`
 * shows the policies working; this shows they cannot be removed by the role
 * they constrain.
 *
 * **Attempted rather than reasoned about.** A privilege table can be read two
 * ways and a grant can arrive from a role this one inherits, so each escalation
 * is actually run and its refusal is the assertion.
 */
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { user } from './schema/index.js'
import { asRole, hasConcurrentConnections, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const app = pool ? drizzle({ client: pool }) : null

/** A case-scoped table, and the one every other case-owned table is shaped like. */
const SCOPED = 'systems'

describe.skipIf(!app || !hasConcurrentConnections())('the identity the application connects as', () => {
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
   *
   * **Two kinds, because `deployment` names both**: *it MUST NOT be able to
   * change the shape of the store, and MUST NOT be able to alter the rules
   * that decide what it may read*. Adding a column and making a table change
   * the shape, and a role that can add a column can add one the policies say
   * nothing about; the other five change a rule or the identity it runs as.
   */
  it.each([
    ['disable row-level security', sql`alter table systems disable row level security`],
    ['stop forcing it on the owner', sql`alter table systems no force row level security`],
    ['add a column nothing scopes', sql`alter table systems add column probe_widened text`],
    ['make a table of its own', sql`create table probe_widened (id uuid primary key)`],
    // **Named exactly, and without `if exists`.** A wrong name plus `if
    // exists` is a DROP that succeeds having done nothing, which reads as an
    // escalation that worked.
    ['drop the policy outright', sql`drop policy case_reads on systems`],
    ['grant itself the bypass', sql`alter role ic_app bypassrls`],
    ['become the migrating role', sql`set role ic_migrate`],
  ])('cannot %s', async (what, statement) => {
    /**
     * **The SQLSTATE, not merely that it threw.** `rejects.toThrow()` passes
     * on a typo, a renamed object or a syntax error, so it would keep passing
     * the day one of these stopped naming a real thing -- and a statement that
     * cannot run is not a statement that was refused.
     *
     * `42501` is `insufficient_privilege`, which is the scenario's own words:
     * *refused by the store rather than by its own restraint*. All seven
     * answer it today.
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
   * **The boundary is still there afterwards.** Seven refusals prove nothing if
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
    ).toContain('case_reads')
  })
})

afterAll(async () => {
  await pool?.end()
})

/**
 * **The store's own acts are the other way past a policy**, since each runs as
 * the role that owns the tables. An act that answers across cases is asked by
 * an account the install does not hold as an administrator, and one asked for
 * nobody answers nothing that names a case.
 */
describe.skipIf(!app || !hasConcurrentConnections())("the store's own acts", () => {
  /** Acts that answer only about the principal, or about one case they name. */
  const PER_PRINCIPAL = ['ic_administers', 'ic_floor', 'ic_level', 'ic_move_case', 'ic_principal', 'ic_reach']
  const ADMINISTRATOR_ONLY: Record<string, string> = {
    ic_cases_behind: 'select ic_cases_behind(gen_random_uuid())',
    ic_cases_tallied: 'select * from ic_cases_tallied()',
    ic_move_cases: 'select ic_move_cases(gen_random_uuid(), gen_random_uuid())',
    ic_references_shared: 'select * from ic_references_shared(gen_random_uuid(), gen_random_uuid())',
  }
  /** Asked for nobody, so they answer identifiers and digests and never what a case holds. */
  const FOR_NOBODY = ['ic_artefacts_named']

  const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
  const admin = `acts-admin-${String(process.pid)}-${String(Date.now())}`

  beforeAll(async () => {
    await drizzle({ client: seedPool! }).insert(user).values({
      id: admin,
      name: admin,
      email: `${admin}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: 'admin',
    })
  })

  afterAll(async () => {
    await drizzle({ client: seedPool! }).delete(user).where(sql`id = ${admin}`)
    await seedPool!.end()
  })

  /** Run `statement` as `principal` on the app role, rolled back; the SQLSTATE where it raised. */
  async function asking(principal: string, statement: string): Promise<string> {
    const client = await pool!.connect()
    try {
      await client.query('begin')
      await client.query(`select set_config('app.principal', $1, true)`, [principal])
      return await client.query(statement).then(
        () => 'answered',
        (error: { code?: string }) => String(error.code),
      )
    } finally {
      await client.query('rollback')
      client.release()
    }
  }

  it('classes every act the app role may call', async () => {
    const { rows } = await pool!.query<{ name: string }>(`
      select distinct p.proname::text as name from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'ic\\_%'
         and has_function_privilege('ic_app', p.oid, 'execute')
       order by 1`)
    expect(
      rows.map((one) => one.name),
      'an act the app role may call is in no class here, so nobody decided who it answers',
    ).toEqual([...PER_PRINCIPAL, ...Object.keys(ADMINISTRATOR_ONLY), ...FOR_NOBODY].sort())
  })

  it.each(Object.keys(ADMINISTRATOR_ONLY))('%s refuses an account that is not an administrator', async (name) => {
    expect(await asking(randomUUID(), ADMINISTRATOR_ONLY[name]!)).toBe('42501')
    expect(await asking(admin, ADMINISTRATOR_ONLY[name]!), 'the administrator was refused too').toBe(
      'answered',
    )
  })

  it.each(FOR_NOBODY)('%s answers no case content', async (name) => {
    const { fields } = await pool!.query(`select * from ${name}() limit 0`)
    expect(fields.map((one) => one.name)).toEqual(['case_id', 'hash', 'stored'])
  })
})
