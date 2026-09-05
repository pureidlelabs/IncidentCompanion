/**
 * **Reach is enforced where the data is, not where the request arrives.**
 *
 * > Whether a caller may see a row MUST be enforced by the store that holds
 * > it, so that a request the interface did not anticipate cannot reach a row
 * > the caller may not see.
 * >
 * > An entry-point check is necessary and MUST NOT be the only one.
 *
 * `server/test/case-scoping.test.ts` sweeps every collection **through the
 * API** and finds no cross-case leak. That is the entry-point half, and by
 * construction it can only exercise the shapes somebody built a route for --
 * the requirement's whole point is the shapes nobody did.
 *
 * So this asks the database directly, as the role the server connects as, with
 * no case scope set. A raw `select` is the most unanticipated shape there is:
 * no guard, no service, no route. `scoped.ts` says the answer must be nothing:
 *
 * > Unset is default-deny: `current_setting('app.case_id', true)` is NULL when
 * > nothing set it, so a query outside a scoped transaction sees an empty
 * > table rather than the whole one.
 *
 * **The subject list is every case-scoped table**, found by asking the schema
 * which tables carry a `caseId`, so *a new way to read a record is added ...
 * protected without anybody adding a check* covers a table added tomorrow too.
 */
import { eq, getTableColumns, getTableName, is, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, describe, expect, it } from 'vitest'

import * as schema from './schema/index.js'
import { asRole, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
/** The role the server serves requests as, which is the one under test. */
const appPool = URL_ ? openTestPool(URL_, 'ic_app') : null
const app = appPool ? drizzle({ client: appPool }) : null

/** The seeding role, exempt by an explicit policy, used only to count rows. */
const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

afterAll(async () => {
  await appPool?.end()
  await seedPool?.end()
})

/**
 * Every table in the schema that is scoped to a case.
 *
 * Carrying a `caseId` is the same condition `caseScoped` is applied under, so
 * this is the schema's own answer rather than a list kept in step by hand. A
 * table that grows a `caseId` and no policy is exactly what this should catch.
 */
function caseScopedTables(): { name: string; table: PgTable }[] {
  const found: { name: string; table: PgTable }[] = []
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    if (!('caseId' in getTableColumns(value))) continue
    found.push({ name: getTableName(value), table: value })
  }
  return found.sort((one, other) => one.name.localeCompare(other.name))
}

describe.skipIf(!app)('the store refuses an unscoped read', () => {
  const tables = caseScopedTables()

  /**
   * **The vacuity guard.** A sweep over no tables passes every assertion below
   * and reports the database default-deny.
   */
  it('finds the case-scoped tables to sweep', () => {
    expect(tables.map((one) => one.name).length, 'no table carries a caseId').toBeGreaterThan(5)
  })

  /**
   * **The property.** No scope set, so `app.case_id` is NULL and every policy's
   * `USING` is false. A table answering rows here is one where the guard is the
   * only thing standing between a caller and somebody else's case.
   */
  it.each(tables.map((one) => one.name))('answers nothing from %s with no case scope', async (name) => {
    const { table } = tables.find((one) => one.name === name)!

    const rows = await app!.select().from(table).limit(5)

    expect(
      rows.length,
      `${name} returned rows to an unscoped query, so its policy is missing or permissive`,
    ).toBe(0)
  })

  /**
   * **A row that certainly exists, refused to the unscoped reader.**
   *
   * The sweep above is worth nothing over empty tables, and leaning on other
   * suites having left rows behind is how eighteen assertions pass against
   * nothing. So this puts one row in itself, through the seeding role, and asks
   * the two readers about *that* row.
   *
   * It also confirms the seeder's exemption still works, which is the other
   * half of the same policy: granted per table rather than with `BYPASSRLS`,
   * so it is visible in `scoped.ts` and does not silently extend to a table
   * added later.
   */
  it('refuses a row it can see through the exempt role', async () => {
    const [subject] = await seed!
      .insert(schema.cases)
      .values({ title: 'Refused to an unscoped reader' })
      .returning({ id: schema.cases.id })
    const caseId = subject!.id

    try {
      await seed!.insert(schema.timeline).values({
        caseId,
        kind: 'event',
        time: new Date(),
        description: 'A row the app must not see without a scope',
      })

      const exempt = await seed!
        .select()
        .from(schema.timeline)
        .where(eq(schema.timeline.caseId, caseId))
      expect(exempt, 'the fixture did not store the row it is about').toHaveLength(1)

      const unscoped = await app!
        .select()
        .from(schema.timeline)
        .where(eq(schema.timeline.caseId, caseId))
      expect(
        unscoped,
        'the app role read a case row with no scope set, so the guard is the only check',
      ).toHaveLength(0)

      /**
       * **The positive control, and without it the case above is weak.**
       *
       * An empty answer has two explanations -- the policy refused it, or this
       * reader could never have seen it. Setting the scope and reading the
       * same row through the same role separates them: the policy is doing the
       * work, rather than the connection being blind.
       *
       * This is what stands in for a break-verify here. Loosening the policy
       * to `using: true` is the mutation that would prove it directly, and it
       * needs a schema push against the running database, which is not a thing
       * a test run should do.
       */
      const scoped = await app!.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.case_id', ${caseId}, true)`)
        return tx.select().from(schema.timeline).where(eq(schema.timeline.caseId, caseId))
      })
      expect(
        scoped,
        'the app role cannot see the row even scoped, so the refusal above proves nothing',
      ).toHaveLength(1)
    } finally {
      // The timeline row cascades with the case.
      await seed!.delete(schema.cases).where(eq(schema.cases.id, caseId))
    }
  })
})
