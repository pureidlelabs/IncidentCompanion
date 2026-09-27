/**
 * Read a table's column by a name the code only knows at runtime.
 *
 * **Throws, naming the table and the column asked for.** The name cannot be
 * checked at compile time - the callers are the generic collection machinery -
 * so the alternative is `undefined` reaching drizzle, which builds a statement
 * around it and fails three layers down or matches more rows than it named.
 *
 * Not `schema/columns.ts`, which declares the columns every case-owned row
 * carries.
 */
import { getTableColumns } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

/**
 * A table's columns keyed by name.
 *
 * Drizzle hangs each column off the table object as an own property, so this
 * is a view of the same object rather than a copy.
 */
export function columnsOf(table: PgTable): Record<string, PgColumn> {
  return table as unknown as Record<string, PgColumn>
}

/**
 * One column, or an error naming what was asked for.
 *
 * **The own-property check is not pedantry.** `toString`, `constructor` and
 * `hasOwnProperty` all answer a function on any object, so a plain lookup
 * would hand drizzle a prototype member for those names and fail somewhere
 * else entirely.
 */
export function columnOf(table: PgTable, name: string): PgColumn {
  const columns = columnsOf(table)
  if (!Object.prototype.hasOwnProperty.call(columns, name)) {
    const known = Object.keys(columns).sort().join(', ')
    throw new Error(`no column ${name} on this table. It has: ${known}`)
  }
  const found = columns[name]
  if (!found) throw new Error(`no column ${name} on this table`)
  return found
}

/**
 * ISO strings become `Date`s for the columns that are timestamps, as the table
 * declares them rather than as the field is named.
 */
export function coerceTimes(
  table: PgTable,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const cols = getTableColumns(table)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    const column = cols[key]
    // `columnType`, not `dataType`: a timestamp's `dataType` is
    // `'object date'`, so an `=== 'date'` test matches nothing.
    const isTimestamp = column?.columnType?.startsWith('PgTimestamp') ?? false
    out[key] = isTimestamp && typeof value === 'string' ? new Date(value) : value
  }
  return out
}

/**
 * `table`'s columns without its binary ones, for any row a caller is answered
 * with. A binary column holds a document or a picture, read by its own door.
 */
export function wired<T extends PgTable>(table: T): ReturnType<typeof getTableColumns<T>> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table)).filter(([, column]) => column.getSQLType() !== 'bytea'),
  )
}
