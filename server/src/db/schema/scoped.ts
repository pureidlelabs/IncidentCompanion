/**
 * The policies that stop one case's rows reaching another case's screen.
 */
import { sql, type SQL } from 'drizzle-orm'
import { pgPolicy, type PgColumn } from 'drizzle-orm/pg-core'

/** The case this transaction is scoped to, or NULL when nothing set one. */
const currentCase = sql`nullif(current_setting('app.case_id', true), '')::uuid`

/**
 * Spread into a table's config alongside its indexes.
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
