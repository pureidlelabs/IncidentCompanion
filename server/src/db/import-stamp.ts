/**
 * What a door stamps on a row it is writing, so a row says where it came from.
 *
 * Each of the three columns that record it is on some tables and not others, so
 * the stamp is stated once and filtered to what the target table can hold.
 *
 * **Here rather than beside a door, because the four doors share no layer**;
 * what all four reach is the schema whose columns this answers about.
 * -> `architecture.test.ts`
 */
import { getTableColumns } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

/**
 * The stamp, before the target table narrows it.
 *
 * `source` is the door's own name and is filled in per call; the other two say
 * the row arrived rather than was typed, which is the same answer at every
 * import door.
 */
const IMPORTED = { provenance: 'imported', unreviewed: true } as const

/**
 * What `door` asserts about a row it writes into `table`, as fields to write.
 *
 * `door` is what the door calls itself -- `CSV_IMPORT`, a provider's own name,
 * `ARCHIVE_IMPORT`. A table with no column for it records that the row was
 * imported and nothing about where from; a table with none of the three gets
 * an empty object.
 *
 * **Filtered rather than written unconditionally**, because a key naming no
 * column is dropped by the query builder without a word -- so an unstated
 * filter is silent on half the tables and puts a field those tables lack into
 * the change feed's own record of what was written.
 */
export function importStamp(door: string, table: PgTable): Record<string, unknown> {
  const columns = getTableColumns(table)
  return Object.fromEntries(
    Object.entries({ source: door, ...IMPORTED }).filter(([field]) => field in columns),
  )
}
