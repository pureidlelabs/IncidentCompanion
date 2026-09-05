/**
 * **Reach is enforced where the data is, not where the request arrives.**
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
   * **The property.**
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
