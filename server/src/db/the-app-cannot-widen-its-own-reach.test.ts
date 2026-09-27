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
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { eq, inArray, is, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { PgTable } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  caseNotes,
  cases,
  changeFeed,
  customers,
  groupCustomers,
  groupMembers,
  groups,
  proseAcceptances,
  user,
} from './schema/index.js'
import * as schema from './schema/index.js'
import { grants } from './schema/grants.js'
import { ACCEPTANCE_LASTS } from './schema/scoped.js'
import { CASE_WRITABLE } from '../domain/case.js'
import { CHANNEL_OF } from './schema/install-activity.js'
import { OCSF_VERSION, classify } from '../install-activity/ocsf.js'
import { retentionClassOf } from '../install-activity/retention-class.js'
import { ProseService } from '../prose/prose.service.js'
import { defaultCustomer } from '../customers/customers.service.js'
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
  /** Acts that remove only what has lapsed, whoever asks. */
  const LAPSED_ONLY = ['ic_sweep_acceptances']
  /** Acts that answer a constant of the store's and read nothing. */
  const CONSTANTS = ['ic_acceptance_lasts']

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
       where n.nspname = 'public' and (p.proname like 'ic\\_%' or p.prosecdef)
         and has_function_privilege('ic_app', p.oid, 'execute')
       order by 1`)
    expect(
      rows.map((one) => one.name),
      'an act the app role may call is in no class here, so nobody decided who it answers',
    ).toEqual([...PER_PRINCIPAL, ...Object.keys(ADMINISTRATOR_ONLY), ...FOR_NOBODY, ...LAPSED_ONLY, ...CONSTANTS].sort())
  })

  it.each(['refuse_a_change_to_a_sent_report', 'refuse_a_part_of_a_sent_report'])(
    "%s cannot be hung on a table of the caller's own",
    async (guard) => {
      expect(
        await asking(
          admin,
          `create temp table probe (id uuid); create trigger probe before update on probe for each row execute function public.${guard}()`,
        ),
      ).toBe('42501')
    },
  )

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

/**
 * **The role the application enters to store prose is not a way past the case
 * boundary.** It may store a record only where the store holds an acceptance
 * for it, made under a writer's own reach, and may name only those writers.
 * Each attack enters it the way the save does and names what it likes.
 */
describe.skipIf(!app || !hasConcurrentConnections())('the prose role, entered by the application', () => {
  const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
  const seed = () => drizzle({ client: seedPool! })
  const stamp = `${String(process.pid)}-${String(Date.now())}`
  const writer = `prose-writer-${stamp}`
  const victim = `prose-victim-${stamp}`
  let unreached = ''
  let caseA = ''
  let caseB = ''
  let accepted = ''
  let unaccepted = ''
  let elsewhere = ''

  /** Runs `statement` as the prose role with `record` in `kase`; the rows it touched, or its SQLSTATE. */
  async function asProse(kase: string, record: string, statement: ReturnType<typeof sql>): Promise<number | string> {
    try {
      return await app!.transaction(async (tx) => {
        await tx.execute(sql`set local role ic_prose`)
        await tx.execute(
          sql`select set_config('app.case_id', ${kase}, true), set_config('app.prose_record', ${record}, true), set_config('app.principal', '', true)`,
        )
        return (await tx.execute(statement)).rowCount ?? 0
      })
    } catch (error) {
      for (let at: unknown = error; at instanceof Object; at = (at as { cause?: unknown }).cause) {
        const code = (at as { code?: unknown }).code
        if (typeof code === 'string') return code
      }
      throw error
    }
  }

  beforeAll(async () => {
    await seed()
      .insert(user)
      .values(
        [writer, victim].map((id) => ({
          id,
          name: id,
          email: `${id}@example.invalid`,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'analyst',
        })),
      )
    unreached = ((await seed().insert(customers).values({ name: `Nobody reaches ${stamp}` }).returning())[0]!).id
    caseA = ((await seed().insert(cases).values({ title: 'Prose A', customerId: unreached }).returning())[0]!).id
    caseB = ((await seed().insert(cases).values({ title: 'Prose B', customerId: unreached }).returning())[0]!).id
    const notes = await seed()
      .insert(caseNotes)
      .values([
        { caseId: caseA, note: 'accepted' },
        { caseId: caseA, note: 'unaccepted' },
        { caseId: caseB, note: 'elsewhere' },
      ])
      .returning()
    ;[accepted, unaccepted, elsewhere] = notes.map((one) => one.id) as [string, string, string]
    await seed()
      .insert(proseAcceptances)
      .values({ caseId: caseA, entity: 'casenotes', recordId: accepted, writerId: writer })
  })

  afterAll(async () => {
    await seed().delete(cases).where(inArray(cases.id, [caseA, caseB]))
    await seed().delete(customers).where(eq(customers.id, unreached))
    await seed().delete(user).where(inArray(user.id, [writer, victim]))
    await seedPool?.end()
  })

  it('stores a record its writer was accepted into, naming them', async () => {
    expect(
      await asProse(caseA, accepted, sql`update casenotes set note = 'kept', updated_by = ${writer} where id = ${accepted}`),
    ).toBe(1)
  })

  it('stores no record nobody was accepted into', async () => {
    expect(
      await asProse(caseA, unaccepted, sql`update casenotes set note = 'INJECTED', updated_by = ${writer} where id = ${unaccepted}`),
    ).not.toBe(1)
  })

  it('stores no record of another case, whichever case it names', async () => {
    expect(
      await asProse(caseA, elsewhere, sql`update casenotes set note = 'INJECTED', updated_by = ${writer} where id = ${elsewhere}`),
    ).toBe(0)
    expect(
      await asProse(caseB, elsewhere, sql`update casenotes set note = 'INJECTED', updated_by = ${writer} where id = ${elsewhere}`),
    ).not.toBe(1)
  })

  it('names nobody on the record whose words were not accepted', async () => {
    expect(
      await asProse(caseA, accepted, sql`update casenotes set note = 'x', updated_by = ${victim} where id = ${accepted}`),
    ).toBe('42501')
  })

  it('writes no change or audit line naming somebody whose words were not accepted', async () => {
    expect(
      await asProse(
        caseA,
        accepted,
        sql`insert into change_feed (case_id, entity, entity_id, op, version, actor_id) values (${caseA}, 'casenotes', ${accepted}, 'update', 1, ${victim})`,
      ),
    ).toBe('42501')
    expect(
      await asProse(
        caseA,
        accepted,
        sql`insert into install_activity (event, channel, retention_class, class_uid, activity_id, type_uid, schema_version, severity_id, status_id, actor_id, detail)
            values ('api_called', ${CHANNEL_OF.api_called}, ${retentionClassOf('api_called')}, ${classify('api_called').classUid},
                    ${classify('api_called').activityId}, ${classify('api_called').typeUid}, ${OCSF_VERSION}, 1, 1, ${victim},
                    ${JSON.stringify({ case: caseA, record: accepted })}::jsonb)`,
      ),
    ).toBe('42501')
  })

  it('cannot rename the writer an acceptance names', async () => {
    const renamed = await app!
      .transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.case_id', ${caseA}, true), set_config('app.principal', ${writer}, true)`,
        )
        return (await tx.execute(sql`update prose_acceptances set writer_id = ${victim} where record_id = ${accepted}`))
          .rowCount
      })
      .catch((error: unknown) => (error as { cause?: { code?: string } }).cause?.code ?? String(error))

    expect(renamed).toBe('42501')
  })

  it('stores nothing on an acceptance older than an acceptance lasts', async () => {
    await seed()
      .insert(proseAcceptances)
      .values({
        caseId: caseA,
        entity: 'casenotes',
        recordId: unaccepted,
        writerId: writer,
        acceptedAt: sql`now() - ${ACCEPTANCE_LASTS}::interval - interval '1 minute'`,
      })
    try {
      expect(
        await asProse(caseA, unaccepted, sql`update casenotes set note = 'late', updated_by = ${writer} where id = ${unaccepted}`),
      ).not.toBe(1)
    } finally {
      await seed().delete(proseAcceptances).where(eq(proseAcceptances.recordId, unaccepted))
    }
  })

  /** Runs `statement` as the application with `principal` asking in `kase`; the rows it touched, or its SQLSTATE. */
  async function asApp(principal: string, kase: string, statement: ReturnType<typeof sql>): Promise<number | string> {
    try {
      return await app!.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.case_id', ${kase}, true), set_config('app.principal', ${principal}, true)`,
        )
        return (await tx.execute(statement)).rowCount ?? 0
      })
    } catch (error) {
      for (let at: unknown = error; at instanceof Object; at = (at as { cause?: unknown }).cause) {
        const code = (at as { code?: unknown }).code
        if (typeof code === 'string') return code
      }
      throw error
    }
  }

  it('cannot date an acceptance for later, to outlast its writer\'s reach', async () => {
    const [open] = await seed().insert(cases).values({ title: 'Everybody writes this' }).returning()
    const [note] = await seed().insert(caseNotes).values({ caseId: open!.id, note: 'x' }).returning()
    try {
      const dated = (when: ReturnType<typeof sql>) =>
        asApp(
          victim,
          open!.id,
          sql`insert into prose_acceptances (case_id, entity, record_id, writer_id, accepted_at)
              values (${open!.id}, 'casenotes', ${note!.id}, ${victim}, ${when})`,
        )
      expect({
        now: await dated(sql`now()`),
        aMinute: await dated(sql`now() + interval '1 minute'`),
        aDay: await dated(sql`now() + interval '1 day'`),
        aCentury: await dated(sql`now() + interval '100 years'`),
      }).toEqual({ now: 1, aMinute: '42501', aDay: '42501', aCentury: '42501' })
    } finally {
      await seed().delete(cases).where(eq(cases.id, open!.id))
    }
  })

  it('cannot remove an acceptance of somebody else\'s, in a case it writes or out of any case', async () => {
    // The default customer's: every account writes it, the victim included.
    const [open] = await seed().insert(cases).values({ title: 'Everybody writes this' }).returning()
    const [note] = await seed().insert(caseNotes).values({ caseId: open!.id, note: 'x' }).returning()
    const [{ id } = { id: '' }] = await seed()
      .insert(proseAcceptances)
      .values({ caseId: open!.id, entity: 'casenotes', recordId: note!.id, writerId: writer })
      .returning({ id: proseAcceptances.id })
    try {
      expect({
        another: await asApp(victim, open!.id, sql`delete from prose_acceptances where id = ${id}`),
        nobody: await asApp('', '', sql`delete from prose_acceptances where id = ${id}`),
      }).toEqual({ another: 0, nobody: 0 })
    } finally {
      await seed().delete(cases).where(eq(cases.id, open!.id))
    }
  })

  it('sweeps an acceptance older than one lasts, and leaves one that has not yet lapsed', async () => {
    const aged = (by: ReturnType<typeof sql>) =>
      seed()
        .insert(proseAcceptances)
        .values({ caseId: caseA, entity: 'casenotes', recordId: unaccepted, writerId: writer, acceptedAt: by })
        .returning({ id: proseAcceptances.id })
    const [{ id: old } = { id: '' }] = await aged(sql`now() - ${ACCEPTANCE_LASTS}::interval - interval '1 minute'`)
    const [{ id: nearly } = { id: '' }] = await aged(sql`now() - ${ACCEPTANCE_LASTS}::interval + interval '1 minute'`)
    try {
      await new ProseService(app!).sweepExpiredAcceptances()
      const left = await seed()
        .select({ id: proseAcceptances.id })
        .from(proseAcceptances)
        .where(inArray(proseAcceptances.id, [old, nearly]))
      expect(left.map((one) => one.id)).toEqual([nearly])
    } finally {
      await seed().delete(proseAcceptances).where(inArray(proseAcceptances.id, [old, nearly]))
    }
  })

  it('reads no lapsed acceptance, naming nobody or naming somebody who does not reach its case', async () => {
    const [{ id: old } = { id: '' }] = await seed()
      .insert(proseAcceptances)
      .values({
        caseId: caseA,
        entity: 'casenotes',
        recordId: unaccepted,
        writerId: writer,
        acceptedAt: sql`now() - ${ACCEPTANCE_LASTS}::interval - interval '1 minute'`,
      })
      .returning({ id: proseAcceptances.id })
    try {
      const read = (principal: string, kase: string) =>
        app!.transaction(async (tx) => {
          await tx.execute(
            sql`select set_config('app.case_id', ${kase}, true), set_config('app.principal', ${principal}, true)`,
          )
          return (await tx.execute(sql`select writer_id from prose_acceptances where id = ${old}`)).rows.length
        })
      expect({ nobody: await read('', ''), outsider: await read(victim, caseA) }).toEqual({
        nobody: 0,
        outsider: 0,
      })
    } finally {
      await seed().delete(proseAcceptances).where(eq(proseAcceptances.id, old))
    }
  })

  it('keeps only a current acceptance of the accepted record current, and changes nothing else about one', async () => {
    const [{ id: old } = { id: '' }] = await seed()
      .insert(proseAcceptances)
      .values({
        caseId: caseA,
        entity: 'casenotes',
        recordId: accepted,
        writerId: writer,
        acceptedAt: sql`now() - ${ACCEPTANCE_LASTS}::interval - interval '1 minute'`,
      })
      .returning({ id: proseAcceptances.id })
    const [{ id: elsewhere } = { id: '' }] = await seed()
      .insert(proseAcceptances)
      .values({ caseId: caseA, entity: 'casenotes', recordId: unaccepted, writerId: writer })
      .returning({ id: proseAcceptances.id })
    try {
      const refresh = (where: ReturnType<typeof sql>, set = sql`accepted_at = now()`) =>
        asProse(caseA, accepted, sql`update prose_acceptances set ${set} where ${where}`)
      expect({
        // The residual: an application that enters the role keeps a live acceptance of its record live.
        current: await refresh(sql`record_id = ${accepted} and writer_id = ${writer} and id <> ${old}`),
        lapsed: await refresh(sql`id = ${old}`),
        anotherRecord: await refresh(sql`id = ${elsewhere}`),
        later: await refresh(sql`record_id = ${accepted} and id <> ${old}`, sql`accepted_at = now() + interval '1 day'`),
        anotherWriter: await refresh(sql`record_id = ${accepted} and id <> ${old}`, sql`writer_id = ${victim}, accepted_at = now()`),
      }).toEqual({ current: 1, lapsed: 0, anotherRecord: 0, later: '42501', anotherWriter: '42501' })
    } finally {
      await seed().delete(proseAcceptances).where(inArray(proseAcceptances.id, [old, elsewhere]))
    }
  })

  it('names nobody on a record only because another record has a writer without an account', async () => {
    const gone = `prose-gone-${stamp}`
    await seed()
      .insert(proseAcceptances)
      .values({ caseId: caseA, entity: 'casenotes', recordId: unaccepted, writerId: gone })
    try {
      expect(
        await asProse(caseA, accepted, sql`update casenotes set note = 'x', updated_by = null where id = ${accepted}`),
      ).toBe('42501')
    } finally {
      await seed().delete(proseAcceptances).where(eq(proseAcceptances.writerId, gone))
    }
  })
})

/**
 * **What the application keeps as a record, and what only the store may change.**
 * A writer of a case adds to its change feed and never rewrites it, and moves
 * the case to another customer only through `ic_move_case`.
 */
describe.skipIf(!app || !hasConcurrentConnections())('what a writer of a case cannot rewrite', () => {
  const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
  /** The administrator, on the suite's own database rather than the one its URL names. */
  const adminPool = (() => {
    if (!URL_ || !process.env.ADMIN_DATABASE_URL) return null
    const at = new URL(process.env.ADMIN_DATABASE_URL)
    at.pathname = new URL(URL_).pathname
    return openTestPool(at.toString())
  })()
  const seed = () => drizzle({ client: seedPool! })
  const stamp = `${String(process.pid)}-${String(Date.now())}`
  const [writer, other, admin] = ['writer', 'other', 'admin'].map((who) => `record-${who}-${stamp}`) as [
    string,
    string,
    string,
  ]
  let owner = ''
  let elsewhere = ''
  let fallback = ''
  let kase = ''

  /** Runs `statement` as the application with `principal` asking in `scope`; the rows it touched, or its SQLSTATE. */
  async function asApp(principal: string, statement: ReturnType<typeof sql>, scope = kase): Promise<number | string> {
    try {
      return await app!.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.case_id', ${scope}, true), set_config('app.principal', ${principal}, true)`,
        )
        return (await tx.execute(statement)).rowCount ?? 0
      })
    } catch (error) {
      for (let at: unknown = error; at instanceof Object; at = (at as { cause?: unknown }).cause) {
        const code = (at as { code?: unknown }).code
        if (typeof code === 'string') return code
      }
      throw error
    }
  }

  /**
   * The same, with `grant` given to the app role for the transaction alone, so
   * a refusal that lasts is the store's and not the missing privilege's.
   */
  async function asAppGranted(grant: string, principal: string, statement: string): Promise<number | string> {
    const client = await adminPool!.connect()
    try {
      await client.query('begin')
      await client.query(grant)
      await client.query('set local role ic_app')
      await client.query(`select set_config('app.case_id', $1, true), set_config('app.principal', $2, true)`, [
        kase,
        principal,
      ])
      return await client.query(statement).then(
        (result) => result.rowCount ?? 0,
        (error: { code?: string }) => String(error.code),
      )
    } finally {
      await client.query('rollback')
      client.release()
    }
  }

  const feedOf = async (id: string) =>
    (await seed().select().from(changeFeed).where(eq(changeFeed.caseId, id)).orderBy(changeFeed.seq)).map(
      (row) => `${row.entity}:${String(row.actorId)}`,
    )

  const customerOf = async (id: string) =>
    (await seed().select({ at: cases.customerId }).from(cases).where(eq(cases.id, id)))[0]?.at

  beforeAll(async () => {
    await seed()
      .insert(user)
      .values(
        [writer, other, admin].map((id) => ({
          id,
          name: id,
          email: `${id}@example.invalid`,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: id === admin ? 'admin' : 'analyst',
        })),
      )
    fallback = (await defaultCustomer(seed())).id
    ;[owner, elsewhere] = (
      await seed()
        .insert(customers)
        .values([{ name: `Owner ${stamp}` }, { name: `Elsewhere ${stamp}` }])
        .returning()
    ).map((one) => one.id) as [string, string]
    const [group] = await seed().insert(groups).values({ name: `Writers ${stamp}` }).returning()
    await seed()
      .insert(groupCustomers)
      .values([owner, elsewhere].map((customerId) => ({ groupId: group!.id, customerId })))
    await seed().insert(groupMembers).values({ groupId: group!.id, userId: writer, level: 'write' })
    kase = (await seed().insert(cases).values({ title: 'Attributed', customerId: owner }).returning())[0]!.id
    await seed()
      .insert(changeFeed)
      .values(
        ['cases', 'casenotes'].map((entity) => ({
          caseId: kase,
          entity,
          entityId: kase,
          op: 'insert' as const,
          version: 1,
          actorId: writer,
        })),
      )
  })

  afterAll(async () => {
    await seed().delete(cases).where(eq(cases.id, kase))
    await seed().delete(groups).where(eq(groups.name, `Writers ${stamp}`))
    await seed().delete(customers).where(inArray(customers.id, [owner, elsewhere]))
    await seed().delete(user).where(inArray(user.id, [writer, other, admin]))
    await seedPool?.end()
    await adminPool?.end()
  })

  it('adds to the change feed, and cannot rename who made a change or remove one', async () => {
    expect({
      appended: await asApp(
        writer,
        sql`insert into change_feed (case_id, entity, entity_id, op, version, actor_id) values (${kase}, 'systems', ${kase}, 'insert', 1, ${writer})`,
      ),
      renamed: await asApp(writer, sql`update change_feed set actor_id = ${other} where case_id = ${kase}`),
      removed: await asApp(writer, sql`delete from change_feed where case_id = ${kase}`),
    }).toEqual({ appended: 1, renamed: '42501', removed: '42501' })
    expect(await feedOf(kase)).toEqual([`cases:${writer}`, `casenotes:${writer}`, `systems:${writer}`])
  })

  it('rewrites and removes no change feed entry even holding the privilege to', async () => {
    const granted = (statement: string) =>
      asAppGranted('grant update, delete on change_feed to ic_app', writer, statement)
    expect({
      renamed: await granted(`update change_feed set actor_id = '${other}' where case_id = '${kase}'`),
      removed: await granted(`delete from change_feed where case_id = '${kase}'`),
    }).toEqual({ renamed: 0, removed: 0 })
  })

  it('moves no case to another customer by an ordinary write, even holding the privilege to', async () => {
    const granted = (statement: string) => asAppGranted('grant update on cases to ic_app', writer, statement)
    expect({
      toTheDefault: await granted(`update cases set customer_id = '${fallback}' where id = '${kase}'`),
      toNone: await granted(`update cases set customer_id = null where id = '${kase}'`),
      toAnother: await granted(`update cases set customer_id = '${elsewhere}' where id = '${kase}'`),
      unchanged: await granted(`update cases set customer_id = customer_id where id = '${kase}'`),
    }).toEqual({ toTheDefault: '42501', toNone: '42501', toAnother: '42501', unchanged: 1 })
  })

  it('keeps these privileges when the roles are provisioned again after the schema', async () => {
    const roles = await readFile(fileURLToPath(new URL('../../../docker/db/roles.sql', import.meta.url)), 'utf8')
    const client = await adminPool!.connect()
    try {
      await client.query('begin')
      await client.query(roles)
      const { rows } = await client.query<Record<string, boolean>>(`select
        has_table_privilege('ic_app', 'change_feed', 'UPDATE') as "feedUpdate",
        has_table_privilege('ic_app', 'change_feed', 'DELETE') as "feedDelete",
        has_table_privilege('ic_app', 'change_feed', 'INSERT') as "feedInsert",
        has_column_privilege('ic_app', 'cases', 'customer_id', 'UPDATE') as "customer",
        has_column_privilege('ic_app', 'cases', 'is_demo', 'UPDATE') as "isDemo",
        has_column_privilege('ic_app', 'cases', 'title', 'UPDATE') as "title",
        has_table_privilege('ic_seed', 'prose_acceptances', 'UPDATE') as "acceptanceBySeeder",
        has_table_privilege('ic_seed', 'install_activity', 'TRUNCATE') as "truncateBySeeder"`)
      expect(rows[0]).toEqual({
        feedUpdate: false,
        feedDelete: false,
        feedInsert: true,
        customer: false,
        isDemo: false,
        title: true,
        acceptanceBySeeder: false,
        truncateBySeeder: false,
      })
    } finally {
      await client.query('rollback')
      client.release()
    }
  })

  it('takes back on the next push what was granted to everybody', async () => {
    const tables = Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable))
    const client = await adminPool!.connect()
    try {
      await client.query('begin')
      await client.query('grant update on cases to public')
      await client.query('grant update on change_feed to public')
      for (const statement of grants(CASE_WRITABLE, tables)) await client.query(statement)
      const { rows } = await client.query<Record<string, boolean>>(`select
        has_column_privilege('ic_app', 'cases', 'customer_id', 'UPDATE') as "customer",
        has_table_privilege('ic_app', 'change_feed', 'UPDATE') as "feed"`)
      expect(rows[0]).toEqual({ customer: false, feed: false })
    } finally {
      await client.query('rollback')
      client.release()
    }
  })

  it('sets nothing a case is made with or marked by', async () => {
    const set = (assignment: ReturnType<typeof sql>) =>
      asApp(writer, sql`update cases set ${assignment} where id = ${kase}`)
    expect({
      isDemo: await set(sql`is_demo = true`),
      createdBy: await set(sql`created_by = ${other}`),
      createdAt: await set(sql`created_at = now() - interval '1 year'`),
      id: await set(sql`id = gen_random_uuid()`),
    }).toEqual({ isDemo: '42501', createdBy: '42501', createdAt: '42501', id: '42501' })
  })

  it('cannot return an attributed case to the default customer, or to none', async () => {
    expect({
      toTheDefault: await asApp(writer, sql`update cases set customer_id = ${fallback} where id = ${kase}`),
      toNone: await asApp(writer, sql`update cases set customer_id = null where id = ${kase}`),
      throughTheMove: await asApp(writer, sql`select ic_move_case(${kase}, ${fallback})`),
    }).toEqual({ toTheDefault: '42501', toNone: '42501', throughTheMove: 1 })
    expect(await customerOf(kase)).toBe(owner)
  })

  it('moves the case to another customer through the store, and still edits the rest of it', async () => {
    expect(await asApp(writer, sql`select ic_move_case(${kase}, ${elsewhere})`)).toBe(1)
    expect(await customerOf(kase)).toBe(elsewhere)
    expect(await asApp(writer, sql`update cases set title = 'Renamed' where id = ${kase}`)).toBe(1)
  })

  it('takes its change feed with it when the case is deleted', async () => {
    const [open] = await seed().insert(cases).values({ title: 'Deleted', customerId: fallback }).returning()
    await seed()
      .insert(changeFeed)
      .values({ caseId: open!.id, entity: 'cases', entityId: open!.id, op: 'insert', version: 1, actorId: admin })
    expect(await asApp(admin, sql`delete from cases where id = ${open!.id}`, open!.id)).toBe(1)
    expect(await feedOf(open!.id)).toEqual([])
  })
})
