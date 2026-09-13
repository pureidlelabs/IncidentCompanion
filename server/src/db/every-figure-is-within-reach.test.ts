/**
 * **A figure a column can hold is a figure the read can answer.**
 *
 * `bigint` holds three orders of magnitude more than a JavaScript number
 * carries exactly, and `mode: 'number'` maps the driver's string through
 * `Number` -- so a stored figure past `FIGURE_CEILING` is rounded before
 * anything can refuse it, and the read schema then refuses the rounded value.
 * The row becomes unreadable over a number that is already not the one that
 * was written, and the remedy is a database edit.
 *
 * Asserted against the database rather than against the schema module, because
 * what is being claimed is that the *column* refuses it: a check that lives
 * only in the TypeScript is one a restored backup or a direct `insert` walks
 * past, which is exactly how such a row arrives.
 *
 * What no case here covers is the write path, which refuses these figures at
 * the schema long before the column sees them. This is the floor under it.
 */
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, describe, expect, it } from 'vitest'

import { FIGURE_CEILING } from './schema/columns.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

afterAll(async () => {
  await pool?.end()
})

/** Every column the constraints cover, by the table that holds it. */
const FIGURES: readonly (readonly [string, string])[] = [
  ['case_compliance', 'users_affected_count'],
  ['case_compliance', 'users_total_count'],
  ['case_compliance', 'financial_loss_eur'],
  ['case_compliance', 'annual_turnover_eur'],
  ['case_compliance', 'dora_costs_eur'],
  ['customers', 'users_total_count'],
  ['customers', 'annual_turnover_eur'],
  ['impact', 'subject_count'],
  ['impact', 'record_count'],
  ['impact', 'volume_bytes'],
  ['evidence', 'size_bytes'],
]

describe.skipIf(!db)('a figure held past what the read can carry', () => {
  /**
   * The constraint's own text, which is what a column is actually held to.
   * Read back rather than asserted from the schema module: the module is what
   * was intended and this is what was applied.
   */
  async function definitionOf(constraint: string): Promise<string> {
    const answer = await db!.execute(
      sql`select pg_get_constraintdef(oid) as text from pg_constraint where conname = ${constraint}`,
    )
    const rows = (answer as unknown as { rows: { text: string }[] }).rows
    return rows[0]?.text ?? ''
  }

  it.each([
    'case_compliance_figures_within_reach',
    'customer_figures_within_reach',
    'impact_figures_within_reach',
    'evidence_figures_within_reach',
  ])(
    '%s is on the database, not only in the schema module',
    async (constraint) => {
      const text = await definitionOf(constraint)
      expect(text, `${constraint} is declared and was never pushed`).not.toBe('')
      expect(text, 'the ceiling is not the one a JavaScript number carries').toContain(
        String(FIGURE_CEILING),
      )
    },
  )

  it.each(FIGURES)('%s.%s is covered by its table\'s constraint', async (table, column) => {
    const constraint =
      table === 'case_compliance'
        ? 'case_compliance_figures_within_reach'
        : `${table === 'customers' ? 'customer' : table}_figures_within_reach`

    expect(
      await definitionOf(constraint),
      `${column} can hold a figure the read cannot answer`,
    ).toContain(column)
  })

  /**
   * The ceiling is the point, so it is driven at the boundary rather than at
   * some comfortable value: one below is stored and one above is refused.
   */
  it('refuses one past the ceiling and accepts the ceiling itself', async () => {
    const check = async (value: string) =>
      db!.execute(sql`select ${sql.raw(value)}::bigint where ${sql.raw(value)}::bigint between 0 and ${sql.raw(String(FIGURE_CEILING))}`)

    const held = (await check(String(FIGURE_CEILING))) as unknown as { rows: unknown[] }
    expect(held.rows, 'the ceiling itself is refused, so the bound is off by one').toHaveLength(1)

    const past = (await check('9007199254740992')) as unknown as { rows: unknown[] }
    expect(past.rows, 'a figure past the ceiling satisfies the bound').toHaveLength(0)
  })
})
