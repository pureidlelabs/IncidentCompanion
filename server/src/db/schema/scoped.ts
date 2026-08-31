/**
 * The policies that stop one case's rows reaching another case's screen.
 *
 * Unset is default-deny: `current_setting('app.case_id', true)` is NULL when
 * nothing set it, so a query outside a scoped transaction sees an empty table
 * rather than the whole one. Every policy carries `WITH CHECK` as well as
 * `USING`, so a scoped caller cannot insert another case's id either.
 */
import { sql, type SQL } from 'drizzle-orm'
import { pgPolicy, type PgColumn } from 'drizzle-orm/pg-core'

/** The case this transaction is scoped to, or NULL when nothing set one. */
const currentCase = sql`nullif(current_setting('app.case_id', true), '')::uuid`

/**
 * Spread into a table's config alongside its indexes.
 *
 * Two policies, and the second is why the seeder is a separate role: it writes
 * across every case, and generating demos deletes all of them - a privilege
 * the process serving requests must not hold. **Granted per table rather than
 * with `BYPASSRLS`**, so the exemption is visible here and does not silently
 * extend to tables added later for reasons nobody revisited.
 */
export function caseScoped(caseId: PgColumn): SQL.Aliased[] | ReturnType<typeof pgPolicy>[] {
  return [
    pgPolicy('case_scope', {
      using: sql`${caseId} = ${currentCase}`,
      withCheck: sql`${caseId} = ${currentCase}`,
    }),
    pgPolicy('seeder_writes_across_cases', {
      to: 'ic_seed',
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ]
}
